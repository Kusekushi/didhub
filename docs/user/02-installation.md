# DidHub: User Installation Guide

This guide explains how to install and run DidHub as an end user. It focuses on a simple, practical setup using Docker, so you can get started quickly without needing developer tools or code changes.

## Prerequisites
- A computer with Linux, macOS, or Windows 10/11.
- Administrative access to install software.
- Steady internet connection.
- Docker Desktop (recommended for Windows/macOS) or Docker Engine (Linux).
- Optional but recommended: 4 GB RAM or more.
- A web browser to access the DidHub interface.

If you don’t already have Docker, install it from the official site: https://www.docker.com/products/docker-desktop

## Installation method: Docker (recommended)

1) Obtain the official DidHub Docker setup package from the project’s releases page and extract it to a folder on your computer. Examples:
- Linux/macOS: ~/didhub
- Windows: C:\DidHub

2) Create a data directory for DidHub data to persist information between runs:
- Linux/macOS: mkdir -p ~/didhub/data
- Windows PowerShell: New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\didhub\data"

3) If the package includes a sample environment file, copy it and customize values. Common values you may need to set include:
- DIDHUB_BASE_URL=http://localhost:8080
- DIDHUB_DATA_DIR=./data

4) Start the service. In the installation folder, run:
- docker-compose up -d

5) Verify that the services are running:
- docker-compose ps
- docker-compose logs -f

6) Open the DidHub user interface in your browser:
- http://localhost:8080

If you chose a different port, use that port instead. The port is defined in the docker-compose.yml or the environment file.

## Configuration steps
- On first launch, DidHub will guide you through onboarding. Create an administrator account with a strong password.
- To customize settings later, edit the environment variables in the .env file (or the equivalent configuration in your setup) and restart the services with:
- docker-compose down && docker-compose up -d
- If you don’t see the changes, double-check that the correct environment file is loaded and that your port is not blocked by a firewall.
- Ensure the data directory you created is kept safe and has write permissions.

## How to start DidHub
- Start: docker-compose up -d
- Stop: docker-compose down
- Restart: docker-compose restart
- Check status: docker-compose ps

## Troubleshooting common installation issues
- Docker not installed or not running: Install Docker Desktop (Windows/macOS) or Docker Engine (Linux) and start Docker.
- Port already in use: Change the port in docker-compose.yml or the .env file, then restart with docker-compose up -d.
- DidHub UI not reachable: Check docker-compose logs for errors, ensure the port is accessible, and verify your firewall settings.
- Data not persisting: Confirm the data directory is mounted correctly in docker-compose.yml and that the path has write permissions.
- Admin onboarding fails: Make sure you are connected to the correct data store and that you are using a strong, unique password.
- Performance issues: Increase the amount of memory allocated to Docker (Docker Desktop settings > Resources).

## Next steps
- After onboarding, follow the guided setup to configure features, add users, and connect data sources.
