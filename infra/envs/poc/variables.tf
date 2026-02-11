variable "aws_region" {
  type    = string
  default = "eu-west-1"
}

variable "name" {
  type    = string
  default = "rudderstack-poc"
}

variable "vpc_cidr" {
  type    = string
  default = "10.30.0.0/16"
}

variable "public_subnet_cidr" {
  type    = string
  default = "10.30.10.0/24"
}

variable "instance_type" {
  type    = string
  default = "t4g.nano"
}

variable "events_bucket" {
  type    = string
  default = "cp-datalake-poc"
}

variable "events_prefix" {
  type    = string
  default = "rudderstack/"
}

variable "rudder_workspace_token" {
  type        = string
  sensitive   = true
  description = "Workspace token from RudderStack Open Source dashboard (Settings > Workspace)."
}
