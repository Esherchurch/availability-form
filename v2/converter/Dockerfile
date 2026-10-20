# EGBC Present - the converter (F-242). Cloud Run; scales to zero.
# LibreOffice turns a PowerPoint file into a PDF (or Microsoft 365 does,
# when the church has connected it - microsoft.mjs); poppler's pdftoppm turns
# each page into a picture. Fonts: the common Microsoft-metric and Noto
# families, so slides look as close to PowerPoint as LibreOffice can; fonts
# the church adds at converter-fonts/ in Storage are loaded at start (fontconfig).
# ffmpeg: a slide video a browser cannot play is made into H.264, and a heavy
# one gets a light 720p copy for phones and weak Wi-Fi (F-251).
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-impress poppler-utils fonts-noto-core fonts-crosextra-carlito fonts-crosextra-caladea fonts-liberation2 fontconfig ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY *.mjs ./
ENV NODE_ENV=production
CMD ["node", "server.mjs"]
