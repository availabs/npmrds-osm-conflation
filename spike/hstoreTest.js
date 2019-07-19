#!/usr/bin/env node

const { set, last } = require('lodash');
const { query, end } = require('./src/services/db_service');

(async () => {
  const sql = 'select osm_id, members, attributes from osm_ways limit 1;';

  const { rows } = await query(sql);

  console.error(JSON.stringify(rows, null, 4));

  const asJson = rows.reduce((acc, { osm_id, members, attributes }) => {
    const d = { members: {}, attributes: {} };

    members.split(/, /g).forEach(member => {
      const m = member.replace(/"/g, '').split(/=>/g);
      set(d.members, m.slice(0, -1), last(m));
    });

    attributes.split(/, /g).forEach(attr => {
      const a = attr.replace(/"/g, '').split(/=>/g);
      set(d.attributes, a.slice(0, -1), last(a));
    });

    acc[osm_id] = d;

    return acc;
  }, {});

  console.log(JSON.stringify(asJson, null, 4));

  end();
})();
