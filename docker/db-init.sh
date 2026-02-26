#!/bin/bash
set -e

DB_SERVER="${DB_SERVER:-ms-sql-server}"
SA_PASSWORD="${SA_PASSWORD:-StrongPassw0rd}"

echo "Waiting for MSSQL to be ready..."
until sqlcmd -S "$DB_SERVER" -U sa -P "$SA_PASSWORD" -C -Q "SELECT 1" &>/dev/null; do
  sleep 2
done
echo "MSSQL is ready."

# Create Hangfire database
echo "Creating Hangfire database..."
sqlcmd -S "$DB_SERVER" -U sa -P "$SA_PASSWORD" -C \
  -Q "IF NOT EXISTS (SELECT * FROM sys.databases WHERE name='Clockshark.HANGFIRE') CREATE DATABASE [Clockshark.HANGFIRE]"

# Publish dacpac (creates schema + runs post-deployment seed scripts)
echo "Publishing dacpac to Clockshark.DATABASE..."
sqlpackage /Action:Publish \
  /SourceFile:/dacpac/Clockshark.DATABASE.dacpac \
  /TargetServerName:"$DB_SERVER" \
  /TargetDatabaseName:"Clockshark.DATABASE" \
  /TargetUser:sa \
  /TargetPassword:"$SA_PASSWORD" \
  /TargetTrustServerCertificate:True

echo "Database initialized successfully."
