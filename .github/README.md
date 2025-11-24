# GitHub Actions CI/CD

## Docker Build Pipeline

This repository includes an automated Docker build pipeline that builds and pushes ARM64 images to a private registry.

### Setup Instructions

1. **Configure GitHub Secrets**

   Go to your repository settings → Secrets and variables → Actions, and add:

   - `DOCKER_REGISTRY_URL`: Your private registry URL
     - Example: `registry.example.com`
     - Example: `ghcr.io/username` (for GitHub Container Registry)
     - Example: `docker.io/username` (for Docker Hub)
   
   - `DOCKER_USERNAME`: Your registry username
   
   - `DOCKER_PASSWORD`: Your registry password/token
     - For GitHub Container Registry: Create a Personal Access Token with `write:packages` scope
     - For Docker Hub: Use your Docker Hub password or access token

2. **Workflow Triggers**

   The workflow automatically runs on:
   - Push to `main` or `master` branch → Tagged as `latest`
   - Release publication → Tagged with release version

3. **Image Tags**

   Each build creates two tags:
   - `latest` or release version (e.g., `v1.0.0`)
   - Short commit SHA (e.g., `abc1234`)

4. **Architecture**

   Images are built for `linux/arm64` architecture using QEMU emulation.

### Manual Testing

To test the Docker build locally:

```bash
# Build for ARM64
docker buildx build --platform linux/arm64 -t fufa:test .

# Or build for your current platform
docker build -t fufa:test .

# Run the container
docker run -p 3000:3000 \
  -e DATABASE_URL="file:./prod.db" \
  -e IMGFLIP_USERNAME="your_username" \
  -e IMGFLIP_PASSWORD="your_password" \
  fufa:test
```

### Registry Examples

#### GitHub Container Registry (ghcr.io)
```yaml
DOCKER_REGISTRY_URL: ghcr.io/yourusername
DOCKER_USERNAME: yourusername
DOCKER_PASSWORD: ghp_xxx... # Personal Access Token
```

#### Docker Hub
```yaml
DOCKER_REGISTRY_URL: docker.io/yourusername
DOCKER_USERNAME: yourusername
DOCKER_PASSWORD: your-docker-hub-password
```

#### Private Registry
```yaml
DOCKER_REGISTRY_URL: registry.yourcompany.com
DOCKER_USERNAME: your-username
DOCKER_PASSWORD: your-password
```

### Pulling Images

After successful build, pull your image:

```bash
docker pull registry.example.com/fufa:latest
# or
docker pull registry.example.com/fufa:abc1234
```

