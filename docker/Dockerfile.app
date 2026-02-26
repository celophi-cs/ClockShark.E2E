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

ENV ASPNETCORE_ENVIRONMENT=E2E
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false

WORKDIR /app

# -- MVC --
FROM runtime-base AS mvc
ARG MVC_PORT=5000
COPY --from=publish-mvc /app/publish .
ENV ASPNETCORE_URLS=http://+:${MVC_PORT}
EXPOSE ${MVC_PORT}
ENTRYPOINT ["dotnet", "ClockShark.MVC.dll"]

# -- Hangfire --
FROM runtime-base AS hangfire
ARG HANGFIRE_PORT=5001
COPY --from=publish-hangfire /app/publish .
ENV ASPNETCORE_URLS=http://+:${HANGFIRE_PORT}
EXPOSE ${HANGFIRE_PORT}
ENTRYPOINT ["dotnet", "ClockShark.HANGFIRE.dll"]

# -- Admin --
FROM runtime-base AS admin
ARG ADMIN_PORT=5002
COPY --from=publish-admin /app/publish .
ENV ASPNETCORE_URLS=http://+:${ADMIN_PORT}
EXPOSE ${ADMIN_PORT}
ENTRYPOINT ["dotnet", "ClockShark.ADMIN.dll"]
