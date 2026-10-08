"""In-process sliding-window limiter for login attempts.

Railway runs a single backend replica, so process memory is a sufficient
store. If the backend is ever scaled out, move this to Redis.
"""
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import HTTPException, status


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window = window_seconds
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)

    def _prune(self, key: str, now: float) -> Deque[float]:
        hits = self._hits[key]
        while hits and now - hits[0] > self.window:
            hits.popleft()
        if not hits:
            self._hits.pop(key, None)
            return deque()
        return hits

    def check(self, key: str) -> None:
        if len(self._prune(key, time.monotonic())) >= self.limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many sign-in attempts. Try again in a few minutes.",
            )

    def hit(self, key: str) -> None:
        now = time.monotonic()
        self._prune(key, now)
        self._hits[key].append(now)

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)


login_ip_limiter = SlidingWindowLimiter(limit=30, window_seconds=15 * 60)
login_failure_limiter = SlidingWindowLimiter(limit=8, window_seconds=15 * 60)
