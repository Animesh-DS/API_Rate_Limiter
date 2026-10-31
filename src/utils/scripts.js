// KEYS[1] - Rate limit key (e.g., rate_limit:premium:user123)
// ARGV[1] - Maximum tokens allowed in the window
// ARGV[2] - Window size in milliseconds
// ARGV[3] - Current timestamp in milliseconds

const SLIDING_WINDOW_LUA = `
  local key = KEYS[1]
  local limit = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])
  local redis_time = redis.call('TIME')
  local now = tonumber(redis_time[1]) * 1000 + math.floor(tonumber(redis_time[2]) / 1000)
  local window_start = now - window

  redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
  local current_count = redis.call('ZCARD', key)

  if current_count >= limit then
    return 0
  end

  redis.call('ZADD', key, now, now)
  redis.call('PEXPIRE', key, window)
  return 1
`;

module.exports = {
  SLIDING_WINDOW_LUA
};