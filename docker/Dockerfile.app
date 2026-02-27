# ============================================================
# Stage 1: Clone and restore (shared across all apps)
# ============================================================
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS restore

ARG NUGET_PAT
ARG GIT_TOKEN
ARG GIT_BRANCH=main

WORKDIR /repo

# Install git and clone (shallow for speed)
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch ${GIT_BRANCH} \
    https://${GIT_TOKEN}@github.com/clockshark/ClockShark.git .

# Add credentials to existing ClockShark.Libraries NuGet source (defined in repo's nuget.config)
RUN dotnet nuget update source "ClockShark.Libraries" \
    --username "az" \
    --password "${NUGET_PAT}" \
    --store-password-in-clear-text \
    --configfile nuget.config

RUN dotnet restore Source/ClockShark.sln

# Generate a self-signed dev certificate for HTTPS
RUN mkdir -p /https && dotnet dev-certs https -ep /https/cert.pfx -p devcertpass

# ============================================================
# Stage 2: Publish each app
# ============================================================
FROM restore AS publish-mvc
RUN dotnet publish Source/ClockShark.MVC/ClockShark.MVC.csproj \
    -c Release -o /app/publish --no-restore

FROM restore AS publish-hangfire
RUN dotnet publish Source/ClockShark.HANGFIRE/ClockShark.HANGFIRE.csproj \
    -c Release -o /app/publish --no-restore

FROM restore AS publish-admin
RUN dotnet publish Source/ClockShark.ADMIN/ClockShark.ADMIN.csproj \
    -c Release -o /app/publish --no-restore

# ============================================================
# Stage 3: Runtime targets
# ============================================================
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime-base

RUN apt-get update && apt-get install -y --no-install-recommends \
    libicu-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy the dev certificate from the SDK stage
COPY --from=restore /https/cert.pfx /https/cert.pfx

ENV ASPNETCORE_ENVIRONMENT=Development
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false

WORKDIR /app

# -- MVC --
FROM runtime-base AS mvc
COPY --from=publish-mvc /app/publish .
EXPOSE 5000
ENTRYPOINT ["dotnet", "ClockShark.MVC.dll"]

# -- Hangfire --
FROM runtime-base AS hangfire
COPY --from=publish-hangfire /app/publish .
EXPOSE 5000
ENTRYPOINT ["dotnet", "ClockShark.HANGFIRE.dll"]

# -- Admin --
FROM runtime-base AS admin
COPY --from=publish-admin /app/publish .
EXPOSE 5000
ENTRYPOINT ["dotnet", "ClockShark.ADMIN.dll"]
