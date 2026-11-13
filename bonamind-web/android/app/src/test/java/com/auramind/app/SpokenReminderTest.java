package com.auramind.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Calendar;
import java.util.TimeZone;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/**
 * The spoken study reminder: when it next fires, and what it says. The
 * visible notification fires at the same time from the same settings, so a
 * wrong time here means the voice and the notification drift apart.
 */
public class SpokenReminderTest {
    private TimeZone saved;

    @Before
    public void fixZone() {
        saved = TimeZone.getDefault();
        TimeZone.setDefault(TimeZone.getTimeZone("America/New_York"));
    }

    @After
    public void restoreZone() {
        TimeZone.setDefault(saved);
    }

    /** Local wall-clock time in the test zone. Month is 1-based. */
    private static long at(int year, int month, int day, int hour, int minute) {
        Calendar c = Calendar.getInstance();
        c.clear();
        c.set(year, month - 1, day, hour, minute, 0);
        return c.getTimeInMillis();
    }

    private static JSONObject daily(int hour, int minute) throws Exception {
        return new JSONObject().put("hour", hour).put("minute", minute);
    }

    private static long next(JSONObject config, long now) {
        return SpokenReminderReceiver.nextTrigger(config, now);
    }

    // 2026-11-13 is a Friday.

    @Test
    public void laterTodayWhenTheTimeIsStillAhead() throws Exception {
        assertEquals(at(2026, 11, 13, 18, 30), next(daily(18, 30), at(2026, 11, 13, 9, 0)));
    }

    @Test
    public void tomorrowOnceTheTimeHasPassed() throws Exception {
        assertEquals(at(2026, 11, 14, 8, 0), next(daily(8, 0), at(2026, 11, 13, 9, 0)));
    }

    @Test
    public void strictlyAfterNow() throws Exception {
        // Rescheduling from inside the alarm that just fired must not fire again.
        assertEquals(at(2026, 11, 14, 9, 0), next(daily(9, 0), at(2026, 11, 13, 9, 0)));
    }

    @Test
    public void defaultsToNineInTheMorning() {
        assertEquals(at(2026, 11, 14, 9, 0), next(new JSONObject(), at(2026, 11, 13, 10, 0)));
    }

    @Test
    public void weeklyGoesToTheNextMatchingWeekday() throws Exception {
        JSONObject monday = daily(7, 15).put("weekday", Calendar.MONDAY);
        assertEquals(at(2026, 11, 16, 7, 15), next(monday, at(2026, 11, 13, 9, 0)));
    }

    @Test
    public void weeklyOnTodayAfterTheTimeWaitsAWeek() throws Exception {
        JSONObject friday = daily(8, 0).put("weekday", Calendar.FRIDAY);
        assertEquals(at(2026, 11, 20, 8, 0), next(friday, at(2026, 11, 13, 9, 0)));
    }

    @Test
    public void weeklyOnTodayBeforeTheTimeIsToday() throws Exception {
        JSONObject friday = daily(20, 0).put("weekday", Calendar.FRIDAY);
        assertEquals(at(2026, 11, 13, 20, 0), next(friday, at(2026, 11, 13, 9, 0)));
    }

    @Test
    public void anOutOfRangeWeekdayMeansDaily() throws Exception {
        assertEquals(at(2026, 11, 14, 8, 0), next(daily(8, 0).put("weekday", 9), at(2026, 11, 13, 9, 0)));
    }

    @Test
    public void keepsTheWallClockTimeAcrossTheClockChange() throws Exception {
        // US clocks go back on 2026-11-01: 9:00 the next morning, not 8:00 or 10:00.
        assertEquals(at(2026, 11, 1, 9, 0), next(daily(9, 0), at(2026, 10, 31, 21, 0)));
    }

    @Test
    public void chosenModeSpeaksTheChosenMessage() throws Exception {
        JSONObject config = new JSONObject().put("mode", "chosen").put("message", "  Time to review!  ")
                .put("messages", new JSONArray(Arrays.asList("Other one")));
        assertEquals("Time to review!", SpokenReminderReceiver.pickMessage(config));
    }

    @Test
    public void chosenModeWithNoMessageFallsBackToThePool() throws Exception {
        JSONObject config = new JSONObject().put("mode", "chosen").put("message", " ")
                .put("messages", new JSONArray(Arrays.asList("Only one")));
        assertEquals("Only one", SpokenReminderReceiver.pickMessage(config));
    }

    @Test
    public void randomModePicksANonBlankLineFromThePool() throws Exception {
        JSONObject config = new JSONObject().put("mode", "random")
                .put("messages", new JSONArray(Arrays.asList("", "  ", "Cards are due", " Quick review? ")));
        for (int i = 0; i < 50; i++) {
            String said = SpokenReminderReceiver.pickMessage(config);
            assertTrue(said, said.equals("Cards are due") || said.equals("Quick review?"));
        }
    }

    @Test
    public void nothingToSayIsEmpty() throws Exception {
        assertEquals("", SpokenReminderReceiver.pickMessage(new JSONObject().put("mode", "random")));
    }
}
