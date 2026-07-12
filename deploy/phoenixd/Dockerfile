FROM node:22.23.1-bookworm-slim@sha256:53ada149d435c38b14476cb57e4a7da73c15595aba79bd6971b547ceb6d018bf
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY gateway.mjs server.mjs smoke.mjs ./
RUN mkdir /data && chown node:node /data
USER node
CMD ["node", "server.mjs"]
