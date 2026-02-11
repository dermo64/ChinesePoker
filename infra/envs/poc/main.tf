data "aws_availability_zones" "available" {}

# --- Pull Cloudflare IP ranges (always up to date) ---
data "http" "cloudflare_ipv4" {
  url = "https://www.cloudflare.com/ips-v4"
}

data "http" "cloudflare_ipv6" {
  url = "https://www.cloudflare.com/ips-v6"
}

locals {
  cloudflare_ipv4_cidrs = compact(split("\n", trimspace(data.http.cloudflare_ipv4.response_body)))
  cloudflare_ipv6_cidrs = compact(split("\n", trimspace(data.http.cloudflare_ipv6.response_body)))
}

# --- VPC ---
resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${var.name}-vpc" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.name}-igw" }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.public_subnet_cidr
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = true
  tags                    = { Name = "${var.name}-public-subnet" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = { Name = "${var.name}-public-rt" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# --- Security group: allow RudderStack ingress ONLY from Cloudflare ---
resource "aws_security_group" "rudder" {
  name        = "${var.name}-sg"
  description = "RudderStack dataplane ingress (Cloudflare only)"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "RudderStack from Cloudflare (IPv4)"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = local.cloudflare_ipv4_cidrs
  }

  ingress {
    description      = "RudderStack from Cloudflare (IPv6)"
    from_port        = 8080
    to_port          = 8080
    protocol         = "tcp"
    ipv6_cidr_blocks = local.cloudflare_ipv6_cidrs
  }

  # Outbound allowed (needed for RudderStack to talk to RudderStack control plane + S3)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.name}-sg" }
}

# --- IAM role for EC2: SSM + S3 writes ---
data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ec2_role" {
  name               = "${var.name}-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json
}

# SSM (Session Manager) so you can connect without SSH
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "s3_write" {
  statement {
    sid       = "ListBucketPrefix"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::${var.events_bucket}"]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["${var.events_prefix}*"]
    }
  }

  statement {
    sid       = "WriteObjects"
    effect    = "Allow"
    actions   = ["s3:PutObject", "s3:AbortMultipartUpload"]
    resources = ["arn:aws:s3:::${var.events_bucket}/${var.events_prefix}*"]
  }

  statement {
    sid       = "GetBucketLocation"
    effect    = "Allow"
    actions   = ["s3:GetBucketLocation"]
    resources = ["arn:aws:s3:::${var.events_bucket}"]
  }
}

resource "aws_iam_policy" "s3_write" {
  name   = "${var.name}-s3-write"
  policy = data.aws_iam_policy_document.s3_write.json
}

resource "aws_iam_role_policy_attachment" "attach_s3" {
  role       = aws_iam_role.ec2_role.name
  policy_arn = aws_iam_policy.s3_write.arn
}

resource "aws_iam_instance_profile" "this" {
  name = "${var.name}-instance-profile"
  role = aws_iam_role.ec2_role.name
}

# --- EC2 instance (Amazon Linux 2023 arm64) ---
data "aws_ami" "al2023_arm64" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-kernel-6.1-arm64"]
  }
}

locals {
  # RudderStack's official docker compose uses backend + transformer + postgres and needs WORKSPACE_TOKEN
  # CONFIG_BACKEND_URL points to RudderStack hosted control plane.
  user_data = <<-EOF
    #!/bin/bash
    set -euo pipefail

    dnf update -y
    dnf install -y docker

    systemctl enable docker
    systemctl start docker

    # Install docker compose plugin (fallback to manual if package not present)
    if ! docker compose version >/dev/null 2>&1; then
      mkdir -p /usr/local/lib/docker/cli-plugins
      curl -L "https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-linux-aarch64" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
      chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    fi

    mkdir -p /opt/rudderstack
    cat > /opt/rudderstack/rudder-docker.yml <<YAML
    version: "3.7"
    services:
      db:
        image: postgres:15-alpine
        environment:
          - POSTGRES_USER=rudder
          - POSTGRES_PASSWORD=password
          - POSTGRES_DB=jobsdb
        shm_size: 128mb

      d-transformer:
        image: rudderstack/rudder-transformer:latest
        ports:
          - "9090:9090"

      backend:
        image: rudderlabs/rudder-server:latest
        depends_on:
          - db
          - d-transformer
        ports:
          - "8080:8080"
        environment:
          - JOBS_DB_HOST=db
          - JOBS_DB_USER=rudder
          - JOBS_DB_PORT=5432
          - JOBS_DB_DB_NAME=jobsdb
          - JOBS_DB_PASSWORD=password
          - DEST_TRANSFORM_URL=http://d-transformer:9090
          - CONFIG_BACKEND_URL=https://api.rudderstack.com
          - WORKSPACE_TOKEN=${var.rudder_workspace_token}
    YAML

    docker compose -f /opt/rudderstack/rudder-docker.yml up -d
  EOF
}

resource "aws_instance" "rudder" {
  ami                         = data.aws_ami.al2023_arm64.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.rudder.id]
  iam_instance_profile        = aws_iam_instance_profile.this.name
  associate_public_ip_address = true
  user_data                   = local.user_data

  tags = { Name = "${var.name}-ec2" }
}

# Stable public IP for Cloudflare DNS
resource "aws_eip" "rudder" {
  instance = aws_instance.rudder.id
  domain   = "vpc"
  tags     = { Name = "${var.name}-eip" }
}
