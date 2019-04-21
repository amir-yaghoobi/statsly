const Redis = require('ioredis')
const Influx = require('influx')
const Promise = require('bluebird')
const moment = require('moment')
const Debug = require('debug')
const debug = Debug('statsly')
const cDebug = Debug('statsly:collector')

function defaultDateToString(date) {
  if (!this.moment.isMoment(date)) {
    if (date) {
      date = this.moment(date)
    } else {
      date = this.moment()
    }
  }
  return date.format(this.dateFormat)
}

function defaultStringToDate(formattedDate) {
  return this.moment(formattedDate, this.dateFormat)
}


function hashStringToHashInteger(obj = {}) {
  return Object.keys(obj).reduce((newObj, key) => {
    newObj[key] = +obj[key] || 0
    return newObj
  }, {})
}

function defaultCategoryMapper(category) {
  return category + '-stats'
}

function collector(formattedDate) {
  cDebug('start processing stats')

  this.redisDB
    .smembers(this.__CATEGORIES_KEY)
    .then(categories => {
      cDebug('active categories "%s"', categories)

      const today = this.moment()
      today.startOf('day')

      const todayFormattedDate = this.__dateToString(today)
      const when = formattedDate ? this.__stringToDate(formattedDate) : today

      return Promise.each(categories, category => {
        const statsKey = this.__getStatsKey(category, formattedDate || todayFormattedDate)
        return this.redisDB
          .hgetall(statsKey)
          .then(stats => {
            stats = hashStringToHashInteger(stats)

            if (Object.keys(stats).length === 0) {
              cDebug('"%s" no stats found', statsKey)
              return Promise.resolve(false)
            }

            const catDB = this.__categoryMapper(category)
            cDebug('"%s" collected stats is "%o"', statsKey, stats)

            const point = {
              measurement: this.measurement,
              fields: stats,
              timestamp: when.toDate()
            }
            return this.influxDB
              .writePoints([point], {database: catDB})
              .then(() => {
                cDebug('collected stats for "%s" inserted into %s influx database', statsKey, catDB)
                return true
              })
          })
      })
        .then(() => {
          cDebug('stats process is finished')

          // in-case we get to the next day
          // we might have some unhandled new stats in redis
          // so we should take care of them
          if (this.__last_date !== todayFormattedDate) {
            cDebug('date change detected today "%s" previous "%s"', todayFormattedDate, this.__last_date)

            let previousDate
            if (this.__last_date) {
              previousDate = this.__last_date
            } else {
              const pDate = moment()
              pDate.add(-1, 'day')
              pDate.startOf('day')

              previousDate = this.__dateToString(pDate)
            }

            this.__last_date = todayFormattedDate

            return this.__collector(previousDate)
          }
        })
    })
    .catch(err => {
      console.error('[statsly] error during collecting stats', err)
    })
}

class Statsly {
  constructor(redisConfig = {}, influxConfig = {}, config = {}) {
    this.prefix = config.prefix || 'statsly'
    this.defaultExpiry = config.defaultExpiry || 172800 // two days
    this.measurement = config.measurement || 'stats'
    this.dateFormat = config.dateFormat || 'YYYYMMDD'
    this.moment = config.moment || moment

    if (typeof config.categoryMapper === 'function') {
      this.__categoryMapper = config.categoryMapper
    } else {
      this.__categoryMapper = defaultCategoryMapper
    }

    this.__dateToString = defaultDateToString.bind(this)
    this.__stringToDate = defaultStringToDate.bind(this)

    this.redisDB = new Redis(redisConfig)
    this.influxDB = new Influx.InfluxDB(influxConfig)

    this.__collector = collector.bind(this)
    this.__CATEGORIES_KEY = `${this.prefix}:active`
    this.__getStatsKey = (category, formattedDate) => `${this.prefix}:${category}:${formattedDate}`

    this.__getPipeline = () => {
      if (!this.__pipeline) {
        this.__pipeline = this.redisDB.pipeline();
        process.nextTick(() => {
          this.__pipeline.exec()
          this.__pipeline = null
        })
      }
      return this.__pipeline
    }
  }

  register(...categories) {
    return Promise.fromCallback(cb => {
      this.__getPipeline().sadd(this.__CATEGORIES_KEY, ...categories, cb)
    })
  }

  unregister(...categories) {
    return Promise.fromCallback(cb => {
      this.__getPipeline().srem(this.__CATEGORIES_KEY, ...categories, cb)
    })
  }

  increment(category, statsKey, value = 1) {
    const key = this.__getStatsKey(category, this.__dateToString(new Date()))
    return Promise.fromCallback(cb => this.__getPipeline().hincrby(key, statsKey, value, cb))
  }

  set(category, statsKey, value) {
    const key = this.__getStatsKey(category, this.__dateToString(new Date()))
    return Promise.fromCallback(cb => this.__getPipeline().hset(key, statsKey, value, cb))
  }

  reset(category) {
    const key = this.__getStatsKey(category, this.__dateToString(new Date()))
    return Promise.fromCallback(cb => this.__getPipeline().del(key, cb))
  }

  startCollector(freq) {
    if (!this.__interval) {
      this.__interval = setInterval(() => this.__collector(), freq)
      return true
    }
    return false
  }

  stopCollector() {
    if (this.__interval) {
      clearInterval(this.__interval)
    }
  }
}

module.exports = Statsly
