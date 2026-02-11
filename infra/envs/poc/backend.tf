terraform {
  backend "s3" {
    bucket         = "dermo64-tfstate-poc"
    key            = "rudder-poc/terraform.tfstate"
    region         = "eu-west-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}