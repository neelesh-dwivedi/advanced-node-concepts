const mongoose = require('mongoose');
const redis = require('redis');
const {promisify} = require('util');
const redisUrl = "redis://127.0.0.1:6379";
const client = redis.createClient(redisUrl);
const exec = mongoose.Query.prototype.exec;
client.hget = promisify(client.hget);

mongoose.Query.prototype.cache = function(options = {}) {
  this.useCache = true;
  this.hashKey = JSON.stringify(options.key || '');
  return this;
}

mongoose.Query.prototype.exec = async function() {
  if (!this.useCache) {
    return exec.apply(this, arguments);
  }
  const key = JSON.stringify(Object.assign({}, this.getQuery(), {
    collection: mongoose.Collection.name
  }));
  let cachedValue = await client.hget(this.hashKey, key);
  if (cachedValue) {
    console.log('returning from cache')
    cachedValue = JSON.parse(cachedValue);
    return Array.isArray(cachedValue) && cachedValue.map(x => new this.model(x)) || new this.model(cachedValue);
  }
  console.log('returning from db')
  let result = await exec.apply(this, arguments);
  client.hset(this.hashKey, key, JSON.stringify(result));
  return result;
}

module.exports = {
  clearCache(hashKey) {
    client.del(JSON.stringify(hashKey));
  }
}