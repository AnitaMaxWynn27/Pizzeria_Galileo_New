# Usa un'immagine Node.js ufficiale come base.
FROM node:20-alpine

# Imposta la directory di lavoro all'interno del container
WORKDIR /usr/src/app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
# Copia i file package.json e package-lock.json
COPY package*.json ./

# Installa le dipendenze del progetto
RUN npm install

# Copia il resto del codice sorgente dell'applicazione
COPY . .

USER appuser

# Esponi la porta
EXPOSE 3000

# Comando per avviare l'applicazione
CMD [ "node", "server.js" ]