FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable
COPY . .
RUN yarn build:prod
ENV ENVIRONMENT=docker
EXPOSE 8084
CMD ["sh", "-c", "yarn migrate:up && node dist/index.js"]
