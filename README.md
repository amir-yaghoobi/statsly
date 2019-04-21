# Statsly
[![npm version](https://badge.fury.io/js/statsly.svg)](https://badge.fury.io/js/statsly)

Statsly is a stats collector leveraging [redisDB](https://redis.io/) and [influxDB](https://www.influxdata.com/)

## Installation

Run `npm install statsly`

## Usage

First of all you should `register` your category (`statsly.register('cat')`). after that you can start incrementing stats for your category:

```javascript
statsly.increment('cat', 'successRequest', 1)
```

Now in-order to periodically insert data influx you should start stats collector:
```javascript
const frequency = 5 * 60 * 1000 // 5 min
statsly.startCollector(frequency)
```

> Collector only insert stats for registered categories



## Example

Check out `examples/` folder for more example and usages.
