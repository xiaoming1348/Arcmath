-- 2026-05-21: Split UI locale from feedback locale.
--
-- Background:
--   `User.locale` controls the UI language (top nav, buttons, problem-set
--   pages, etc.) and is set via the top-nav language switcher.
--
--   For pilot we discovered students don't want the UI language to also
--   change the language the AI tutor uses for step-by-step feedback /
--   hints. Reason: the competition exams themselves (AMC/AIME/Putnam)
--   are written in English, so feedback in English keeps vocabulary
--   aligned. A Chinese-UI student may still prefer English feedback.
--
--   We therefore split the two prefs:
--     - User.locale         → UI language (existing)
--     - User.feedbackLocale → AI-feedback / hint language (new column)
--
--   Default for feedbackLocale is NULL → application defaults to "en".
--   Students can opt into Chinese feedback via /account.
--
--   No backfill needed — existing rows get NULL, which the resolver
--   already treats as "en".

ALTER TABLE "User"
  ADD COLUMN "feedbackLocale" TEXT;
