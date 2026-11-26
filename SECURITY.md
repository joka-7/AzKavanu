# Security Policy

## Reporting a vulnerability

Please report security problems in Az Kavanu privately by email to
[joka.dev.7@gmail.com](mailto:joka.dev.7@gmail.com), not in a public issue. Include
what you found, how to reproduce it, and what an attacker could do with it.

You'll get an acknowledgement as soon as possible. If the report is confirmed, a fix is
prioritized and released, and you're told when it ships.

Az Kavanu has no server, so the most useful reports concern what runs on the device:
- a way for a group file, or anything else read from Google Drive, to change a member's
  data beyond their own section, or to run script in the app;
- a way to reach files in someone's Drive other than Az Kavanu's own;
- the Google access token leaving the device or being written to storage or logs.

## Supported versions

This is a single-maintainer project with no separate release branches. Only the latest
commit on `main`, and the Android release built from it, are supported; please check that
you can reproduce the issue there before reporting.
