const app = require('./app');
const env = require('./config/env');
const { iniciarScheduler } = require('./services/scheduler.service');

app.listen(env.port, () => {
  console.log(`Servidor escuchando en el puerto ${env.port}`);
  iniciarScheduler();
});
