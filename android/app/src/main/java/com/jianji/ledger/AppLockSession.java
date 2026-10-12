package com.jianji.ledger;

/** Per-process lock state; an external image picker is part of the current editing session. */
final class AppLockSession {
    private boolean enabled;
    private boolean locked;
    private int mediaToken;
    private boolean mediaOpen;

    AppLockSession(boolean enabled) { this.enabled = enabled; this.locked = enabled; }
    boolean isLocked() { return enabled && locked; }
    boolean isMediaOpen() { return mediaOpen; }
    void authenticated() { locked = false; }
    void setEnabled(boolean enabled) { this.enabled = enabled; locked = false; }
    int beginMedia() {
        if (isLocked()) return 0;
        mediaOpen = true;
        return ++mediaToken;
    }
    void finishMedia(int token) { if (token != 0 && token == mediaToken) mediaOpen = false; }
    void stopped(boolean authenticating) { if (enabled && !mediaOpen && !authenticating) locked = true; }
    void screenOff() { if (enabled) locked = true; }
}
