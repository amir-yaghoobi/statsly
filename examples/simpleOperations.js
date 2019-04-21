const Statsly = require('../index')

const redisConfig = {
  port: 6379,
  host: '127.0.0.1',
  family: 4,
  password: '',
  db: 0
}

const influxConfig = {
  host: 'localhost',
  port: 8086,
}

const statslyConfig = {
  categoryMapper: (category) => category + '-sample',
  // moment: require('moment') // you can provide you custom moment
  prefix: 'statsly',
  defaultExpiry: 172800,
  measurement: 'stats',
  dateFormat: 'YYYYMMDD',
}

const statsly = new Statsly(redisConfig, influxConfig, statslyConfig)


const categories = ['cat01', 'cat02', 'cat03', 'cat04']
const statsKeys = ['key01', 'key02', 'key03', 'key04', 'key05']

statsly.register(...categories)

// Unregistering "cat04" will prevent inserting that stats into influx
statsly.unregister('cat04')

// reset stats in redis
statsly.reset('cat04')


statsly.set('cat04', 'key05', 100)

// Generate random stats every 100ms
setInterval(() => {
  const c = categories[Math.ceil(Math.random() * categories.length) - 1]
  const k = statsKeys[Math.ceil(Math.random() * statsKeys.length) - 1]
  const v = Math.ceil(Math.random() * k.length)
  statsly.increment(c, k, v)
}, 100)

// Collect stats and insert them into influx every 10sec
statsly.startCollector(10000)
