EDWARDS FAMILY BAKERY — TEST SUITE
===================================

WHAT THIS IS
------------
A set of automated checks for the app's core business logic — things like
order totals, customer matching by phone, and address parsing. It exists
to catch a specific kind of bug: something changes later (a price, a
product being deleted, a customer's info) and it silently breaks a
calculation that already happened. That's exactly the class of bug that
prompted building this in the first place.

This does NOT test the visual/UI side of the app (buttons, layout,
colors) — only the underlying logic in shared.js.


ONE-TIME SETUP CHECK
---------------------
1. Open the Terminal app on your Mac.
2. Type: node --version
3. Press Enter.
   - If you see a version number (like v20.11.0), you're all set.
   - If you see "command not found," let Claude know and it'll walk
     you through installing Node.js — it's free and only takes a minute.


HOW TO RUN THE TESTS
----------------------
1. Open Terminal.
2. Navigate to the folder where you keep the site files (the same folder
   you zip up before uploading to GitHub). For example:
       cd ~/Desktop/efb-site
3. Run:
       node tests/shared.test.js
4. You'll see one of two things:
   - "✅ All tests passed." — everything's healthy.
   - A list of ❌ failures with an explanation of exactly what broke and
     why — copy/paste that to Claude for help fixing it.


WHEN TO RUN THIS
------------------
- Before uploading any batch of files Claude gives you that touched
  pricing, customer matching, or order logic — as a quick sanity check.
- Anytime you've manually changed something in the Google Sheet or the
  Apps Script code yourself.
- Honestly, cheap enough to just run whenever you're about to make a
  batch of changes and want the reassurance nothing's silently broken.

It takes about a second to run and never touches your live data — it's
all self-contained fake test data, nothing goes near your real Google
Sheet.
