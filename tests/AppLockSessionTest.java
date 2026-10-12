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
        System.out.println("App lock session regressions: passed");
    }
}
