package com.jianji.ledger;
import java.util.function.LongSupplier;

/** Per-process lock state; an external image picker is part of the current editing session. */
final class AppLockSession {
    private boolean enabled;
    private boolean locked;
    private int mediaToken;
    private boolean mediaOpen;
    private long backgroundAt = -1;
    private long delayMs;
    private final LongSupplier clock;

    AppLockSession(boolean enabled) { this(enabled, () -> System.nanoTime() / 1000000); }
    AppLockSession(boolean enabled, LongSupplier clock) { this.enabled = enabled; this.locked = enabled; this.clock = clock; }
    boolean isLocked() {
        if (enabled && backgroundAt >= 0 && clock.getAsLong() - backgroundAt >= delayMs) locked = true;
        return enabled && locked;
    }
    boolean isMediaOpen() { return mediaOpen; }
    void authenticated() { locked = false; backgroundAt = -1; }
    void setEnabled(boolean enabled) { this.enabled = enabled; authenticated(); }
    void setDelay(long delayMs) { this.delayMs = delayMs; }
    void resumed() { isLocked(); backgroundAt = -1; }
    int beginMedia() {
        if (isLocked()) return 0;
        mediaOpen = true;
        return ++mediaToken;
    }
    void finishMedia(int token) { if (token != 0 && token == mediaToken) mediaOpen = false; }
    void stopped(boolean authenticating) {
        if (enabled && !mediaOpen && !authenticating && backgroundAt < 0) backgroundAt = clock.getAsLong();
        isLocked();
    }
    void screenOff() { if (enabled) locked = true; }
}
