package com.jianji.ledger;

public class AppLockSessionTest {
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    public static void main(String[] args) {
        AppLockSession session = new AppLockSession(true);
        check(session.isLocked(), "Cold start must lock");
        check(session.beginMedia() == 0, "Locked session must not open media");
        session.authenticated();
        int photo = session.beginMedia();
        session.stopped(false);
        check(!session.isLocked(), "Camera must preserve authenticated session");
        session.finishMedia(photo);
        check(!session.isLocked() && !session.isMediaOpen(), "Photo result must clear media exemption");
        session.stopped(false);
        check(session.isLocked(), "Home after photo must lock normally");
        session.authenticated();
        int picker = session.beginMedia();
        session.stopped(false);
        session.finishMedia(picker);
        check(!session.isLocked(), "Cancel picker must also preserve editing session");
        int latest = session.beginMedia();
        session.finishMedia(picker);
        check(session.isMediaOpen(), "Old result must not clear a newer picker");
        session.screenOff();
        session.finishMedia(latest);
        check(session.isLocked(), "Screen off during picker must still lock");
        session.authenticated();
        session.stopped(true);
        check(!session.isLocked(), "System authentication must not immediately relock");
        session.setEnabled(false);
        session.screenOff(); session.stopped(false);
        check(!session.isLocked(), "Disabled lock must remain disabled");
        check(new AppLockSession(true).isLocked(), "Restart during capture must lock");
        long[] clock = {1000};
        AppLockSession delayed = new AppLockSession(true, () -> clock[0]);
        delayed.setDelay(30000); delayed.authenticated(); delayed.stopped(false);
        clock[0] = 30999; check(!delayed.isLocked(), "Under 30 seconds remains unlocked");
        delayed.resumed(); clock[0] = 80000; check(!delayed.isLocked(), "Foreground must not expire");
        delayed.stopped(false); clock[0] = 110000; delayed.resumed();
        check(delayed.isLocked(), "30-second boundary locks");
        delayed.authenticated(); delayed.setDelay(60000); delayed.stopped(false);
        clock[0] += 59999; check(!delayed.isLocked(), "Under 60 seconds remains unlocked");
        clock[0]++; check(delayed.isLocked(), "60-second boundary locks");
        delayed.authenticated(); int delayedPhoto = delayed.beginMedia(); delayed.stopped(false);
        clock[0] += 120000; delayed.finishMedia(delayedPhoto); delayed.resumed();
        check(!delayed.isLocked(), "Camera return keeps session even after delay");
        delayed.screenOff(); check(delayed.isLocked(), "Delay never exempts screen off");
        System.out.println("App lock session regressions: passed");
    }
}
