# Pilot email templates — English

Ready-to-personalize copy for every email the ops team sends during the
90-day pilot. Curly-braced placeholders are meant to be swapped for the
real values before sending. Keep emails short; the school doesn't want
marketing, they want to know what to do next.

Suggested "from" address: `pilot@arcmath.ai` with a real name in the
display field so replies feel personal.

## 1. Pre-call confirmation

Sent after the school has agreed to pilot and a kickoff date is
booked. Purpose: set expectations for the call and collect the last
bits of info you need to create the tenant.

**Subject:** ArcMath pilot kickoff — a few things to prep

> Hi {{admin_name}},
>
> Looking forward to our kickoff on {{kickoff_date}} at
> {{kickoff_time}} ({{timezone}}). The call is scheduled for 45
> minutes; we'll walk through the admin dashboard, invite your first
> teachers live, and set up one real class with one real assignment
> before we hang up.
>
> Two quick items to make the call smooth:
>
> 1. Reply with a short slug for your school (e.g. "{{example_slug}}") —
>    it shows up in audit logs we'll reference during support.
> 2. Reply with the names and email addresses of up to two other
>    teachers you'd like to invite during the call. (You'll be the
>    third seat; the pilot includes three teacher seats total.)
>
> You don't need to collect student info yet. We'll do that in the
> second call once your teachers have built their classes.
>
> Talk soon,
> {{ops_name}}

## 2. Kickoff recap

Sent within 24h of the kickoff call. Purpose: confirm what we did,
hand over the join code, and set the next checkpoint.

**Subject:** ArcMath kickoff recap + next steps

> Hi {{admin_name}},
>
> Great call today. Here's what we set up together:
>
> - Your school tenant: **{{school_name}}** (slug `{{school_slug}}`),
>   pilot expires {{trial_end_date}}.
> - Teacher seats used: {{teachers_invited}}/3. Invites emailed to
>   {{teacher_emails}}.
> - First class: **{{class_name}}**, join code **{{join_code}}**.
> - First assignment: **{{assignment_title}}**, due
>   {{assignment_due}}.
>
> **Your next moves:**
> 1. Share the join code `{{join_code}}` with the students you want in
>    {{class_name}}. They sign up at `https://arcmath.ai/login`, then
>    enter the code on their home page.
> 2. Forward this email to your two other teachers so they have a
>    pointer if they get stuck.
>
> **Our next checkpoint:** {{week_1_call_date}} at
> {{week_1_call_time}} ({{timezone}}) — 30-minute call to look at the
> first week of data and answer questions. You'll get a calendar
> invite separately.
>
> In the meantime, the support line is this inbox. We answer inside
> 4 working hours.
>
> {{ops_name}}

## 3. Teacher invite follow-up

Sent 48h after the kickoff if a teacher hasn't claimed their account.
Purpose: get them unstuck without making the school admin chase them.

**Subject:** Your ArcMath pilot invitation is waiting

> Hi {{teacher_name}},
>
> {{admin_name}} at {{school_name}} invited you to join the ArcMath
> pilot on {{invite_date}}. Your account is set up but we haven't seen
> you log in yet.
>
> Here's a fresh password-setup link (the original expires in 7 days):
> {{reset_link}}
>
> Once you're in, you'll land on your teacher home. From there you can
> create a class, invite students, and assign one of our contest sets
> or upload your own.
>
> If this isn't the right time for you, just reply and let us know —
> we'll pause the invite without any fuss.
>
> {{ops_name}}

## 4. Week-1 check-in scheduling

Sent 4–5 days after kickoff. Purpose: pick a time for the 30-min call
and give them a heads-up about what you'll ask.

**Subject:** ArcMath week-1 check-in — pick a slot?

> Hi {{admin_name}},
>
> We're coming up on the first week of your pilot. Time for a quick
> 30-minute check-in:
>
> - What's working / what's felt awkward?
> - A walk through the class dashboard so you can tell us whether the
>   signal matches what you see in class.
> - A working session to invite your next batch of students if you
>   haven't already.
>
> Here are a few slots that work on our side —
> {{slot_1}}, {{slot_2}}, {{slot_3}}. Reply with whichever works or
> suggest another.
>
> {{ops_name}}

## 5. Mid-pilot survey (day ~30)

Sent at day 30. Purpose: collect structured feedback before the
case-study call, so the call can focus on the juicy open-ended parts.

**Subject:** ArcMath pilot — 5-min mid-point check

> Hi {{admin_name}},
>
> You're about a third of the way through the pilot. We'd love five
> minutes of your time on the survey below — your answers feed
> directly into what we ship next.
>
> Survey link: {{survey_url}}
>
> It covers: what your teachers use day-to-day, what students ask for
> that the product doesn't answer, and whether you'd renew today.
> Everything is confidential — we'll only share aggregates with other
> pilot schools.
>
> Thank you, and we'll chat on {{week_3_call_date}}.
>
> {{ops_name}}

## 6. End-of-pilot survey + case-study ask

Sent on day 85 of the 90-day pilot. Purpose: collect the final
structured data and secure a 1-hour case-study call.

**Subject:** ArcMath pilot — final survey + case-study call

> Hi {{admin_name}},
>
> We're at day 85 of the pilot — 5 days out. Two asks:
>
> 1. The end-of-pilot survey (15 min): {{survey_url}}. It's longer
>    than the mid-point one because we need the detail for the
>    renewal decision.
> 2. A 1-hour case-study call with {{ops_name}} and our founder. We'd
>    like to record it (with your consent) and turn it into a short
>    written case study other schools can see. You'll get to review
>    the write-up before we publish anything.
>
> A few proposed slots for the call: {{slot_1}}, {{slot_2}},
> {{slot_3}}. If the case study isn't a fit for your school we
> completely understand — the survey alone still helps us a lot.
>
> Either way, thank you for the last three months.
>
> {{ops_name}}

## 7. Renewal or offboard

Sent day 90, after the case-study call. Purpose: confirm the decision
you already made together on the call. Branches on renew vs. extend vs.
offboard.

**Subject (renew):** Welcome to ArcMath — your pilot is now a subscription

> Hi {{admin_name}},
>
> Signed, sealed, delivered — your school is now on the ArcMath
> SCHOOL plan. Contract: {{contract_link}}. Invoice:
> {{invoice_link}}.
>
> What changes: nothing visible in the product today. Your seat caps,
> join codes, assignments, and student progress all carry over
> verbatim. We'll email separately when we ship the features you
> flagged in the case-study call.
>
> Welcome aboard.
>
> {{ops_name}}

**Subject (extend):** Extending your ArcMath pilot by {{extension_days}} days

> Hi {{admin_name}},
>
> As we discussed — we've extended your pilot through
> {{new_trial_end_date}} so you can run it through {{next_term}}.
> Nothing else changes, and there's no charge during the extension.
>
> {{ops_name}}

**Subject (offboard):** Wrapping up your ArcMath pilot

> Hi {{admin_name}},
>
> As we discussed, we're wrapping up your pilot today. Your teacher
> and student accounts will remain accessible in read-only mode
> until {{data_retention_end}} so you can export anything you need;
> after that date we'll delete practice-run data per our privacy
> policy.
>
> If circumstances change, we'd be glad to revisit — just reply to
> this thread.
>
> Best,
> {{ops_name}}
