# Builds the frontend and the Go server, then serves both from one small,
# non-root image. Build from the repository root:
#   docker build -t fullstack-calculator .
#   docker run --rm -p 8080:8080 fullstack-calculator

FROM node:24.16.0-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.27.4-alpine AS backend
WORKDIR /src/backend
COPY backend/go.mod ./
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=backend /out/server /app/server
COPY --from=frontend /src/frontend/dist /app/static
ENV STATIC_DIR=/app/static
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/server"]
