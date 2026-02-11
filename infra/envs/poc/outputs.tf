output "eip" {
  value = aws_eip.rudder.public_ip
}

output "health_check_origin" {
  value = "http://${aws_eip.rudder.public_ip}:8080/health"
}
