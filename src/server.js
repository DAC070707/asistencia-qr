const app = require('./app');
const env = require('./config/env');

app.listen(env.port, () => {
  console.log(`Servidor escuchando en el puerto ${env.port}`);
});
