// workers.tipo_horario (tipo del horario vigente hoy) tambien puede ser 'ciclo'.
exports.up = async function (knex) {
  await knex.raw('ALTER TABLE workers DROP CONSTRAINT IF EXISTS chk_tipo_horario');
  await knex.raw(
    "ALTER TABLE workers ADD CONSTRAINT chk_tipo_horario CHECK (tipo_horario IN ('semanal','rotativo','ciclo'))"
  );
};

exports.down = async function (knex) {
  await knex('workers').where({ tipo_horario: 'ciclo' }).update({ tipo_horario: null });
  await knex.raw('ALTER TABLE workers DROP CONSTRAINT IF EXISTS chk_tipo_horario');
  await knex.raw(
    "ALTER TABLE workers ADD CONSTRAINT chk_tipo_horario CHECK (tipo_horario IN ('semanal','rotativo'))"
  );
};
