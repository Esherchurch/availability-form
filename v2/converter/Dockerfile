# EGBC Present - the converter (F-242). Cloud Run; scales to zero.
# LibreOffice turns a PowerPoint file into a PDF; poppler's pdftoppm turns
# each page into a picture. Fonts: the common Microsoft-metric and Noto
# families, so slides look as close to PowerPoint as LibreOffice can.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-impress poppler-utils fonts-noto-core fonts-crosextra-carlito fonts-crosextra-caladea fonts-liberation2 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY *.mjs ./
ENV NODE_ENV=production
CMD ["node", "server.mjs"]
