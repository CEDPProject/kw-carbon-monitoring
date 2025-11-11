FROM node:22-alpine3.20

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install
COPY . .

RUN npm install axios
EXPOSE 80

CMD ["node", "app.js"]
