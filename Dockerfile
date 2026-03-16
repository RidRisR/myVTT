FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY server/ server/
COPY src/shared/ src/shared/
COPY src/rules/ src/rules/
COPY plugins/ plugins/
COPY --from=build /app/dist dist/
EXPOSE 4444
CMD ["npx", "tsx", "server/index.ts"]
