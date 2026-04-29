/**
 * Typed translation dictionary.
 *
 * We keep the dictionaries as plain TypeScript modules (not JSON) for two
 * reasons:
 *
 *   1. Type safety — every Locale must implement the full `Messages` shape,
 *      so you can't ship a half-translated locale and only notice at
 *      runtime. Missing keys surface as compile errors.
 *   2. Simple dev ergonomics — rename a key in one place and the TS
 *      compiler walks every call-site. JSON dictionaries can't do that.
 *
 * Keys are intentionally flat dotted-strings (e.g. "topnav.login") rather
 * than nested objects, so the type of `keyof Messages` is a simple string
 * union that's easy to read in error messages.
 *
 * Add new keys here whenever you reach for a string in a component. Keep
 * English natural; keep Chinese formal (not colloquial) since our pilot
 * audience is school staff.
 */

export const SUPPORTED_LOCALES = ["en", "zh"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export type Messages = {
  "common.app_name": string;
  "common.cancel": string;
  "common.save": string;
  "common.create": string;
  "common.delete": string;
  "common.edit": string;
  "common.loading": string;
  "common.error_generic": string;
  "common.confirm": string;

  "topnav.home": string;
  "topnav.teacher": string;
  "topnav.admin": string;
  "topnav.problems": string;
  "topnav.login": string;
  "topnav.logout": string;
  "topnav.language": string;
  "topnav.language.english": string;
  "topnav.language.chinese": string;
  "topnav.tagline": string;
  "topnav.dashboard": string;
  "topnav.organization": string;
  "topnav.assignments": string;
  "topnav.resources": string;
  "topnav.reports": string;
  "topnav.membership": string;
  "topnav.my_work": string;
  "topnav.register": string;
  "topnav.account": string;

  "org.overview.title": string;
  "org.overview.subtitle": string;
  "org.overview.teachers_heading": string;
  "org.overview.students_heading": string;
  "org.overview.classes_heading": string;
  "org.overview.activity_heading": string;
  "org.overview.no_teachers": string;
  "org.overview.no_students": string;
  "org.overview.no_classes": string;
  "org.overview.no_activity": string;
  "org.overview.teacher_class_count": string;
  "org.overview.teacher_assignment_count": string;
  "org.overview.class_taught_by": string;
  "org.overview.class_unassigned": string;
  "org.overview.class_enrollments": string;
  "org.overview.class_assignments": string;
  "org.overview.create_class_heading": string;
  "org.overview.create_class_name_label": string;
  "org.overview.create_class_teacher_label": string;
  "org.overview.create_class_submit": string;
  "org.overview.create_class_no_teachers": string;
  "org.overview.feed_load_more": string;
  "org.overview.feed_no_more": string;
  "org.overview.action.class.create": string;
  "org.overview.action.class.delete": string;
  "org.overview.action.class.assigned_teacher": string;
  "org.overview.action.class.assignment.create": string;
  "org.overview.action.class.assignment.update": string;
  "org.overview.action.class.assignment.delete": string;
  "org.overview.action.class.invite_students": string;
  "org.overview.action.teacher.invite": string;
  "org.overview.action.student.attempt.submit": string;
  "org.overview.action.student.attempt.complete": string;
  "org.overview.action.student.run.complete": string;

  "teacher.home.title": string;
  "teacher.home.subtitle": string;
  "teacher.home.classes_card": string;
  "teacher.home.students_card": string;
  "teacher.home.teachers_card": string;
  "teacher.home.upcoming_due_card": string;
  "teacher.home.new_class": string;

  "teacher.classes.title": string;
  "teacher.classes.empty": string;
  "teacher.classes.create_button": string;
  "teacher.classes.create_dialog_title": string;
  "teacher.classes.name_label": string;
  "teacher.classes.join_code_label": string;
  "teacher.classes.student_count_label": string;
  "teacher.classes.assignment_count_label": string;

  "teacher.class.title_tab_overview": string;
  "teacher.class.title_tab_students": string;
  "teacher.class.title_tab_assignments": string;
  "teacher.class.invite_button": string;
  "teacher.class.invite_dialog_title": string;
  "teacher.class.invite_paste_label": string;
  "teacher.class.invite_submit": string;
  "teacher.class.invite_seats_remaining": string;
  "teacher.class.assign_button": string;
  "teacher.class.assign_dialog_title": string;
  "teacher.class.assign_choose_set": string;
  "teacher.class.assign_due_at_label": string;
  "teacher.class.assign_submit": string;
  "teacher.class.assign_hint_tutor_label": string;
  "teacher.class.assign_hint_tutor_help": string;
  "teacher.class.assignment_hint_count": string;
  "teacher.class.progress_column_hints": string;

  "teacher.upload.title": string;
  "teacher.upload.subtitle": string;
  "teacher.upload.paste_label": string;
  "teacher.upload.auto_assign_label": string;
  "teacher.upload.submit": string;
  "teacher.upload.success": string;
  "teacher.upload.preview_button": string;
  "teacher.upload.commit_button": string;
  "teacher.upload.no_class_option": string;
  "teacher.upload.cta_from_home": string;
  "teacher.upload.cta_from_home_desc": string;

  "teacher.class.back_to_teacher": string;
  "teacher.class.copy_join_code": string;
  "teacher.class.copy_join_code_done": string;
  "teacher.class.join_code_hint": string;
  "teacher.class.no_students": string;
  "teacher.class.no_assignments": string;
  "teacher.class.view_progress": string;
  "teacher.class.remove_student": string;
  "teacher.class.confirm_remove_student": string;
  "teacher.class.regenerate_join_code": string;
  "teacher.class.regenerate_join_code_confirm": string;
  "teacher.class.progress_title": string;
  "teacher.class.progress_column_student": string;
  "teacher.class.progress_column_status": string;
  "teacher.class.progress_column_progress": string;
  "teacher.class.progress_column_correct": string;
  "teacher.class.progress_column_submitted": string;
  "teacher.class.progress_close": string;
  "teacher.class.status_completed": string;
  "teacher.class.status_in_progress": string;
  "teacher.class.status_not_started": string;

  "teacher.invite_result.added": string;
  "teacher.invite_result.already_in_class": string;
  "teacher.invite_result.seat_full": string;
  "teacher.invite_result.email_in_other_org": string;

  "student.home.title": string;
  "student.home.subtitle": string;
  "student.home.empty_assignments": string;
  "student.home.empty_classes": string;
  "student.home.due_in": string;
  "student.home.due_today": string;
  "student.home.due_tomorrow": string;
  "student.home.no_due": string;
  "student.home.overdue": string;
  "student.home.completed": string;
  "student.home.in_progress": string;
  "student.home.not_started": string;
  "student.home.classes_card": string;
  "student.home.upcoming_card": string;
  "student.home.overdue_card": string;
  "student.home.completed_card": string;
  "student.home.start_button": string;
  "student.home.continue_button": string;
  "student.home.review_button": string;
  "student.home.progress_line": string;
  "student.home.classes_heading": string;
  "student.home.assignments_heading": string;
  "student.home.section_upcoming": string;
  "student.home.section_overdue": string;
  "student.home.section_completed": string;
  "student.home.open_report": string;
  "student.home.assignment_from": string;
  "student.home.problem_count": string;

  "student.join.title": string;
  "student.join.subtitle": string;
  "student.join.code_label": string;
  "student.join.submit": string;
  "student.join.success": string;
  "student.join.already_enrolled": string;
  "student.join.not_found": string;
  "student.join.cross_org": string;
  "student.join.seat_full": string;

  "problems.page.badge": string;
  "problems.page.title": string;
  "problems.page.subtitle": string;
  "problems.diagnostic.heading": string;
  "problems.diagnostic.subtitle": string;
  "problems.diagnostic.start_button": string;
  "problems.diagnostic.problem_count": string;
  "problems.diagnostic.tag": string;
  "problems.competitions.heading": string;
  "problems.competitions.subtitle": string;
  "problems.browser.search_placeholder": string;
  "problems.browser.no_results": string;
  "problems.browser.problem_count": string;
  "problems.browser.exam_label": string;
  "problems.browser.year_label": string;
  "problems.browser.real_exam_tag": string;
  "problems.browser.topic_practice_tag": string;
  "problems.browser.locked": string;
  "problems.browser.open": string;
  "problems.browser.unlock": string;
  "problems.browser.back_all": string;
  "problems.browser.set_count": string;
  "problems.browser.problem_total": string;
  "problems.browser.contest.AMC8.full": string;
  "problems.browser.contest.AMC8.short": string;
  "problems.browser.contest.AMC10.full": string;
  "problems.browser.contest.AMC10.short": string;
  "problems.browser.contest.AMC12.full": string;
  "problems.browser.contest.AMC12.short": string;
  "problems.browser.contest.AIME.full": string;
  "problems.browser.contest.AIME.short": string;
  "problems.browser.contest.USAMO.full": string;
  "problems.browser.contest.USAMO.short": string;
  "problems.browser.contest.USAJMO.full": string;
  "problems.browser.contest.USAJMO.short": string;
  "problems.browser.contest.IMO.full": string;
  "problems.browser.contest.IMO.short": string;
  "problems.browser.contest.CMO.full": string;
  "problems.browser.contest.CMO.short": string;
  "problems.browser.contest.PUTNAM.full": string;
  "problems.browser.contest.PUTNAM.short": string;
  "problems.browser.contest.PRACTICE.full": string;
  "problems.browser.contest.PRACTICE.short": string;
  "problems.browser.contest.EUCLID.full": string;
  "problems.browser.contest.EUCLID.short": string;
  "problems.browser.contest.MAT.full": string;
  "problems.browser.contest.MAT.short": string;
  "problems.browser.contest.STEP.full": string;
  "problems.browser.contest.STEP.short": string;

  "home.hero.kicker": string;
  "home.hero.headline": string;
  "home.hero.subhead": string;
  "home.hero.pill_practice": string;
  "home.hero.pill_progress": string;
  "home.hero.pill_aesthetic": string;
  "home.hero.cta_dashboard": string;
  "home.hero.cta_browse_problems": string;
  "home.hero.cta_create_account": string;
  "home.hero.cta_sign_in": string;
  "home.stats.practice_label": string;
  "home.stats.practice_value": string;
  "home.stats.practice_desc": string;
  "home.stats.parent_label": string;
  "home.stats.parent_value": string;
  "home.stats.parent_desc": string;
  "home.stats.library_label": string;
  "home.stats.library_value": string;
  "home.stats.library_desc": string;
  "home.cards.students_title": string;
  "home.cards.students_body": string;
  "home.cards.parents_title": string;
  "home.cards.parents_body": string;
  "home.cards.coaches_title": string;
  "home.cards.coaches_body": string;
  "home.helps.kicker": string;
  "home.helps.headline": string;
  "home.helps.subhead": string;
  "home.helps.assignments_title": string;
  "home.helps.assignments_body": string;
  "home.helps.resources_title": string;
  "home.helps.resources_body": string;
  "home.helps.guided_title": string;
  "home.helps.guided_body": string;
  "home.helps.reports_title": string;
  "home.helps.reports_body": string;
  "home.quickstart.badge_member": string;
  "home.quickstart.badge_guest": string;
  "home.quickstart.title_member": string;
  "home.quickstart.title_guest": string;
  "home.quickstart.body_member": string;
  "home.quickstart.body_guest": string;
  "home.quickstart.role_member": string;
  "home.quickstart.role_guest": string;
  "home.quickstart.link_dashboard": string;
  "home.quickstart.link_browse_problems": string;
  "home.quickstart.link_assignments": string;
  "home.quickstart.link_resources": string;
  "home.quickstart.link_create": string;
  "home.quickstart.link_signin": string;
};

export const EN: Messages = {
  "common.app_name": "ArcMath",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.create": "Create",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.loading": "Loading…",
  "common.error_generic": "Something went wrong.",
  "common.confirm": "Confirm",

  "topnav.home": "Home",
  "topnav.teacher": "Teach",
  "topnav.admin": "Admin",
  "topnav.problems": "Problems",
  "topnav.login": "Log in",
  "topnav.logout": "Log out",
  "topnav.language": "Language",
  "topnav.language.english": "English",
  "topnav.language.chinese": "中文",
  "topnav.tagline": "Focused math practice",
  "topnav.dashboard": "Dashboard",
  "topnav.organization": "Organization",
  "topnav.assignments": "Assignments",
  "topnav.resources": "Resources",
  "topnav.reports": "Reports",
  "topnav.membership": "Membership",
  "topnav.my_work": "My work",
  "topnav.register": "Register",
  "topnav.account": "Account",

  "org.overview.title": "School overview",
  "org.overview.subtitle": "Teachers, students, classes, and recent activity across your school.",
  "org.overview.teachers_heading": "Teachers",
  "org.overview.students_heading": "Students",
  "org.overview.classes_heading": "Classes",
  "org.overview.activity_heading": "Recent activity",
  "org.overview.no_teachers": "No teachers yet. Create teacher accounts above.",
  "org.overview.no_students": "No students yet. Create student accounts above.",
  "org.overview.no_classes": "No classes yet. Create one below and assign it to a teacher.",
  "org.overview.no_activity": "No activity recorded yet.",
  "org.overview.teacher_class_count": "{count} class(es)",
  "org.overview.teacher_assignment_count": "{count} assignment(s)",
  "org.overview.class_taught_by": "Taught by {name}",
  "org.overview.class_unassigned": "(no teacher assigned)",
  "org.overview.class_enrollments": "{count} enrolled",
  "org.overview.class_assignments": "{count} assignments",
  "org.overview.create_class_heading": "Create a class",
  "org.overview.create_class_name_label": "Class name",
  "org.overview.create_class_teacher_label": "Assign to teacher",
  "org.overview.create_class_submit": "Create class",
  "org.overview.create_class_no_teachers": "Add a teacher account first, then create classes here.",
  "org.overview.feed_load_more": "Load more",
  "org.overview.feed_no_more": "No more activity",
  "org.overview.action.class.create": "{actor} created class \"{target}\"",
  "org.overview.action.class.delete": "{actor} deleted class \"{target}\"",
  "org.overview.action.class.assigned_teacher": "{actor} reassigned a class to a different teacher",
  "org.overview.action.class.assignment.create": "{actor} posted assignment \"{target}\"",
  "org.overview.action.class.assignment.update": "{actor} updated assignment \"{target}\"",
  "org.overview.action.class.assignment.delete": "{actor} deleted assignment \"{target}\"",
  "org.overview.action.class.invite_students": "{actor} invited students to a class",
  "org.overview.action.teacher.invite": "{actor} invited a teacher",
  "org.overview.action.student.attempt.submit": "{actor} submitted an answer",
  "org.overview.action.student.attempt.complete": "{actor} completed a problem",
  "org.overview.action.student.run.complete": "{actor} finished an assignment",

  "teacher.home.title": "Teacher dashboard",
  "teacher.home.subtitle":
    "Manage your classes, assign problem sets, and review student progress.",
  "teacher.home.classes_card": "Classes",
  "teacher.home.students_card": "Student seats",
  "teacher.home.teachers_card": "Teacher seats",
  "teacher.home.upcoming_due_card": "Upcoming due",
  "teacher.home.new_class": "New class",

  "teacher.classes.title": "My classes",
  "teacher.classes.empty":
    "You have no classes yet. Create one to start inviting students.",
  "teacher.classes.create_button": "Create class",
  "teacher.classes.create_dialog_title": "New class",
  "teacher.classes.name_label": "Class name",
  "teacher.classes.join_code_label": "Join code",
  "teacher.classes.student_count_label": "Students",
  "teacher.classes.assignment_count_label": "Assignments",

  "teacher.class.title_tab_overview": "Overview",
  "teacher.class.title_tab_students": "Students",
  "teacher.class.title_tab_assignments": "Assignments",
  "teacher.class.invite_button": "Invite students",
  "teacher.class.invite_dialog_title": "Invite students",
  "teacher.class.invite_paste_label":
    "Paste emails (one per line, or comma-separated)",
  "teacher.class.invite_submit": "Send invites",
  "teacher.class.invite_seats_remaining": "{remaining} of {max} student seats remaining",
  "teacher.class.assign_button": "New assignment",
  "teacher.class.assign_dialog_title": "Assign a problem set",
  "teacher.class.assign_choose_set": "Choose problem set",
  "teacher.class.assign_due_at_label": "Due date (optional)",
  "teacher.class.assign_submit": "Assign",
  "teacher.class.assign_hint_tutor_label": "Allow AI hint tutor",
  "teacher.class.assign_hint_tutor_help": "When on, students may request hints; each hint use is logged in their report. Off by default — turn on for practice work, leave off for graded tests.",
  "teacher.class.assignment_hint_count": "{count} hint(s) used",
  "teacher.class.progress_column_hints": "Hints",

  "teacher.upload.title": "Upload a problem set",
  "teacher.upload.subtitle":
    "Paste a teacher-v1 JSON. After upload we'll automatically generate milestone checklists for proof problems.",
  "teacher.upload.paste_label": "Problem-set JSON",
  "teacher.upload.auto_assign_label": "Assign to class (optional)",
  "teacher.upload.submit": "Upload",
  "teacher.upload.success":
    "Uploaded. {count} problems saved; {proofs} proof problems queued for preprocessing.",
  "teacher.upload.preview_button": "Preview",
  "teacher.upload.commit_button": "Commit upload",
  "teacher.upload.no_class_option": "Don't assign yet",
  "teacher.upload.cta_from_home": "Upload your own problem set",
  "teacher.upload.cta_from_home_desc":
    "Paste a JSON export or a hand-written problem set to add it to your library.",

  "teacher.class.back_to_teacher": "Back to dashboard",
  "teacher.class.copy_join_code": "Copy join code",
  "teacher.class.copy_join_code_done": "Copied!",
  "teacher.class.join_code_hint":
    "Students enter this code on the Join a Class page to enroll themselves.",
  "teacher.class.no_students": "No students enrolled yet.",
  "teacher.class.no_assignments": "No assignments yet.",
  "teacher.class.view_progress": "View progress",
  "teacher.class.remove_student": "Remove",
  "teacher.class.confirm_remove_student":
    "Remove this student from the class? Their past attempts are preserved.",
  "teacher.class.regenerate_join_code": "Regenerate join code",
  "teacher.class.regenerate_join_code_confirm":
    "Regenerate the join code? The old code will stop working immediately.",
  "teacher.class.progress_title": "Assignment progress",
  "teacher.class.progress_column_student": "Student",
  "teacher.class.progress_column_status": "Status",
  "teacher.class.progress_column_progress": "Attempted",
  "teacher.class.progress_column_correct": "Correct",
  "teacher.class.progress_column_submitted": "Submitted",
  "teacher.class.progress_close": "Close",
  "teacher.class.status_completed": "Completed",
  "teacher.class.status_in_progress": "In progress",
  "teacher.class.status_not_started": "Not started",

  "teacher.invite_result.added": "Invited",
  "teacher.invite_result.already_in_class": "Already in this class",
  "teacher.invite_result.seat_full": "Seat limit reached",
  "teacher.invite_result.email_in_other_org":
    "Already belongs to another school",

  "student.home.title": "My assignments",
  "student.home.subtitle":
    "Stay on top of upcoming work and revisit past practice.",
  "student.home.empty_assignments":
    "Nothing to do right now. Your teacher will post new assignments soon.",
  "student.home.empty_classes":
    "You haven't joined a class yet. Ask your teacher for the 6-character join code.",
  "student.home.due_in": "Due in {days} days",
  "student.home.due_today": "Due today",
  "student.home.due_tomorrow": "Due tomorrow",
  "student.home.no_due": "No due date",
  "student.home.overdue": "Overdue",
  "student.home.completed": "Completed",
  "student.home.in_progress": "In progress",
  "student.home.not_started": "Not started",
  "student.home.classes_card": "Classes",
  "student.home.upcoming_card": "Upcoming",
  "student.home.overdue_card": "Overdue",
  "student.home.completed_card": "Completed",
  "student.home.start_button": "Start",
  "student.home.continue_button": "Continue",
  "student.home.review_button": "Review",
  "student.home.progress_line": "{attempted}/{total} attempted · {correct} correct",
  "student.home.classes_heading": "My classes",
  "student.home.assignments_heading": "Assignments",
  "student.home.section_upcoming": "Upcoming & in progress",
  "student.home.section_overdue": "Overdue",
  "student.home.section_completed": "Completed",
  "student.home.open_report": "Open report",
  "student.home.assignment_from": "from {className}",
  "student.home.problem_count": "{count} problems",

  "student.join.title": "Join a class",
  "student.join.subtitle":
    "Enter the 6-character code your teacher gave you. Codes are not case-sensitive.",
  "student.join.code_label": "Enter your teacher's join code",
  "student.join.submit": "Join",
  "student.join.success": "You've joined {className}!",
  "student.join.already_enrolled": "You're already a member of {className}.",
  "student.join.not_found": "That code doesn't match any class. Double-check with your teacher.",
  "student.join.cross_org":
    "You're already in another school on ArcMath. Ask your teacher or contact support to switch.",
  "student.join.seat_full":
    "This school is at its student seat limit. Ask your teacher to increase it.",

  "problems.page.badge": "AI Tutor",
  "problems.page.title": "Practice",
  "problems.page.subtitle": "Pick a diagnostic to start, or browse practice sets by competition.",
  "problems.diagnostic.heading": "Free Diagnostic Tests",
  "problems.diagnostic.subtitle": "Whole-test placements. Submit once at the end to generate a report and track progress.",
  "problems.diagnostic.start_button": "Start Test",
  "problems.diagnostic.problem_count": "{count} problems",
  "problems.diagnostic.tag": "Diagnostic test",
  "problems.competitions.heading": "Competitions",
  "problems.competitions.subtitle": "Pick a competition to browse its practice sets. Use the search box inside to filter by year or exam.",
  "problems.browser.search_placeholder": "Search by year or exam…",
  "problems.browser.no_results": "No matching sets.",
  "problems.browser.problem_count": "{count} problems",
  "problems.browser.exam_label": "Exam {exam}",
  "problems.browser.year_label": "{year}",
  "problems.browser.real_exam_tag": "Real exam",
  "problems.browser.topic_practice_tag": "Topic practice",
  "problems.browser.locked": "Locked",
  "problems.browser.open": "Open",
  "problems.browser.unlock": "Unlock",
  "problems.browser.back_all": "← All competitions",
  "problems.browser.set_count": "{count} set{plural}",
  "problems.browser.problem_total": "{count} problem{plural}",
  "problems.browser.contest.AMC8.full": "AMC 8",
  "problems.browser.contest.AMC8.short": "Middle school contest · multiple choice",
  "problems.browser.contest.AMC10.full": "AMC 10",
  "problems.browser.contest.AMC10.short": "Lower high-school contest · multiple choice",
  "problems.browser.contest.AMC12.full": "AMC 12",
  "problems.browser.contest.AMC12.short": "Upper high-school contest · multiple choice",
  "problems.browser.contest.AIME.full": "AIME",
  "problems.browser.contest.AIME.short": "American Invitational · integer answers",
  "problems.browser.contest.USAMO.full": "USAMO",
  "problems.browser.contest.USAMO.short": "USA Olympiad · proof problems",
  "problems.browser.contest.USAJMO.full": "USAJMO",
  "problems.browser.contest.USAJMO.short": "USA Junior Olympiad · proofs",
  "problems.browser.contest.IMO.full": "IMO",
  "problems.browser.contest.IMO.short": "International Math Olympiad · proofs",
  "problems.browser.contest.CMO.full": "CMO 中国奥数",
  "problems.browser.contest.CMO.short": "Chinese Mathematical Olympiad · proofs",
  "problems.browser.contest.PUTNAM.full": "Putnam",
  "problems.browser.contest.PUTNAM.short": "Undergraduate competition · proofs",
  "problems.browser.contest.PRACTICE.full": "Practice Exercises",
  "problems.browser.contest.PRACTICE.short": "Arcmath-authored warmups · not past papers",
  "problems.browser.contest.EUCLID.full": "Euclid",
  "problems.browser.contest.EUCLID.short": "CEMC / Waterloo · short + long-answer",
  "problems.browser.contest.MAT.full": "MAT",
  "problems.browser.contest.MAT.short": "Oxford & Imperial admissions test · multi-choice + worked",
  "problems.browser.contest.STEP.full": "STEP",
  "problems.browser.contest.STEP.short": "Cambridge Sixth Term · long-form papers I / II / III",

  "home.hero.kicker": "ArcMath Learning Workspace",
  "home.hero.headline": "Math practice that keeps students focused and families informed.",
  "home.hero.subhead": "From contest problems to assignments and reports, ArcMath brings everything into one clear learning workspace that feels modern, calm, and easy to trust.",
  "home.hero.pill_practice": "Structured practice",
  "home.hero.pill_progress": "Readable progress tracking",
  "home.hero.pill_aesthetic": "Subtle tech aesthetic",
  "home.hero.cta_dashboard": "Open Dashboard",
  "home.hero.cta_browse_problems": "Browse Problems",
  "home.hero.cta_create_account": "Create Account",
  "home.hero.cta_sign_in": "Sign In",
  "home.stats.practice_label": "Practice Flow",
  "home.stats.practice_value": "Guided",
  "home.stats.practice_desc": "Move from curated sets to focused problem solving without losing momentum.",
  "home.stats.parent_label": "Parent View",
  "home.stats.parent_value": "Clear",
  "home.stats.parent_desc": "Assignments and progress are easier to understand at a glance.",
  "home.stats.library_label": "Contest Library",
  "home.stats.library_value": "Organized",
  "home.stats.library_desc": "Admissions and competition resources stay accessible without making the workspace feel crowded.",
  "home.cards.students_title": "For Students",
  "home.cards.students_body": "Settle into longer problem-solving sessions with a layout that stays calm and easy to read.",
  "home.cards.parents_title": "For Parents",
  "home.cards.parents_body": "See what was assigned, what was completed, and what to focus on next without digging.",
  "home.cards.coaches_title": "For Coaches",
  "home.cards.coaches_body": "Build and manage practice in a workspace that feels more intentional and easier to navigate.",
  "home.helps.kicker": "What ArcMath Helps With",
  "home.helps.headline": "Keep practice structured without making it feel heavy.",
  "home.helps.subhead": "The platform is designed to support steady progress: meaningful practice, visible follow-through, and less time spent hunting for the next step.",
  "home.helps.assignments_title": "Assignments",
  "home.helps.assignments_body": "Turn large goals into manageable sessions with clear directions and expectations.",
  "home.helps.resources_title": "Resources",
  "home.helps.resources_body": "Keep official papers, curated sets, and support materials in one organized place.",
  "home.helps.guided_title": "Guided Support",
  "home.helps.guided_body": "Help students stay moving when they get stuck instead of losing confidence mid-session.",
  "home.helps.reports_title": "Reports",
  "home.helps.reports_body": "Give families and coaches a clearer view of growth, rhythm, and next priorities.",
  "home.quickstart.badge_member": "Ready to continue",
  "home.quickstart.badge_guest": "Quick start",
  "home.quickstart.title_member": "Jump back into your workflow.",
  "home.quickstart.title_guest": "Start with a clean, simple setup.",
  "home.quickstart.body_member": "Your main tools are ready to open whenever you want to continue.",
  "home.quickstart.body_guest": "Create a student account or sign in to personalize dashboards, assignments, and reports.",
  "home.quickstart.role_member": "Member",
  "home.quickstart.role_guest": "Guest",
  "home.quickstart.link_dashboard": "Open Dashboard",
  "home.quickstart.link_browse_problems": "Browse Problems",
  "home.quickstart.link_assignments": "Review Assignments",
  "home.quickstart.link_resources": "Open Resources",
  "home.quickstart.link_create": "Create Account",
  "home.quickstart.link_signin": "Sign In"
};

export const ZH: Messages = {
  "common.app_name": "ArcMath",
  "common.cancel": "取消",
  "common.save": "保存",
  "common.create": "创建",
  "common.delete": "删除",
  "common.edit": "编辑",
  "common.loading": "加载中…",
  "common.error_generic": "出错了，请重试。",
  "common.confirm": "确认",

  "topnav.home": "首页",
  "topnav.teacher": "教学",
  "topnav.admin": "管理",
  "topnav.problems": "题库",
  "topnav.login": "登录",
  "topnav.logout": "退出",
  "topnav.language": "语言",
  "topnav.language.english": "English",
  "topnav.language.chinese": "中文",
  "topnav.tagline": "专注的数学练习",
  "topnav.dashboard": "仪表板",
  "topnav.organization": "学校",
  "topnav.assignments": "作业",
  "topnav.resources": "资源",
  "topnav.reports": "报告",
  "topnav.membership": "会员",
  "topnav.my_work": "我的学习",
  "topnav.register": "注册",
  "topnav.account": "账号",

  "org.overview.title": "学校总览",
  "org.overview.subtitle": "学校内的老师、学生、班级和最近活动。",
  "org.overview.teachers_heading": "老师",
  "org.overview.students_heading": "学生",
  "org.overview.classes_heading": "班级",
  "org.overview.activity_heading": "最近活动",
  "org.overview.no_teachers": "暂无老师，请在上方创建老师账号。",
  "org.overview.no_students": "暂无学生，请在上方创建学生账号。",
  "org.overview.no_classes": "暂无班级，下方创建一个并指派给老师。",
  "org.overview.no_activity": "暂无活动记录。",
  "org.overview.teacher_class_count": "{count} 个班级",
  "org.overview.teacher_assignment_count": "{count} 项作业",
  "org.overview.class_taught_by": "由 {name} 任教",
  "org.overview.class_unassigned": "（未指派老师）",
  "org.overview.class_enrollments": "{count} 名学生",
  "org.overview.class_assignments": "{count} 项作业",
  "org.overview.create_class_heading": "新建班级",
  "org.overview.create_class_name_label": "班级名称",
  "org.overview.create_class_teacher_label": "指派给老师",
  "org.overview.create_class_submit": "创建班级",
  "org.overview.create_class_no_teachers": "请先创建老师账号，再来这里建班级。",
  "org.overview.feed_load_more": "加载更多",
  "org.overview.feed_no_more": "无更多活动",
  "org.overview.action.class.create": "{actor} 创建了班级《{target}》",
  "org.overview.action.class.delete": "{actor} 删除了班级《{target}》",
  "org.overview.action.class.assigned_teacher": "{actor} 把一个班级转交给了其他老师",
  "org.overview.action.class.assignment.create": "{actor} 布置了作业《{target}》",
  "org.overview.action.class.assignment.update": "{actor} 修改了作业《{target}》",
  "org.overview.action.class.assignment.delete": "{actor} 删除了作业《{target}》",
  "org.overview.action.class.invite_students": "{actor} 向班级邀请了学生",
  "org.overview.action.teacher.invite": "{actor} 邀请了一位老师",
  "org.overview.action.student.attempt.submit": "{actor} 提交了一次作答",
  "org.overview.action.student.attempt.complete": "{actor} 完成了一道题",
  "org.overview.action.student.run.complete": "{actor} 完成了一项作业",

  "teacher.home.title": "教师控制台",
  "teacher.home.subtitle": "管理班级、布置作业、跟踪学生进度。",
  "teacher.home.classes_card": "班级",
  "teacher.home.students_card": "学生名额",
  "teacher.home.teachers_card": "教师名额",
  "teacher.home.upcoming_due_card": "即将截止",
  "teacher.home.new_class": "新建班级",

  "teacher.classes.title": "我的班级",
  "teacher.classes.empty": "还没有班级。新建一个即可开始邀请学生。",
  "teacher.classes.create_button": "新建班级",
  "teacher.classes.create_dialog_title": "新建班级",
  "teacher.classes.name_label": "班级名称",
  "teacher.classes.join_code_label": "加入码",
  "teacher.classes.student_count_label": "学生数",
  "teacher.classes.assignment_count_label": "作业数",

  "teacher.class.title_tab_overview": "概览",
  "teacher.class.title_tab_students": "学生",
  "teacher.class.title_tab_assignments": "作业",
  "teacher.class.invite_button": "邀请学生",
  "teacher.class.invite_dialog_title": "邀请学生",
  "teacher.class.invite_paste_label": "粘贴邮箱（每行一个，或用逗号分隔）",
  "teacher.class.invite_submit": "发送邀请",
  "teacher.class.invite_seats_remaining": "剩余学生名额 {remaining} / {max}",
  "teacher.class.assign_button": "新建作业",
  "teacher.class.assign_dialog_title": "布置题目集",
  "teacher.class.assign_choose_set": "选择题目集",
  "teacher.class.assign_due_at_label": "截止日期（可选）",
  "teacher.class.assign_submit": "布置",
  "teacher.class.assign_hint_tutor_label": "允许 AI 提示导师",
  "teacher.class.assign_hint_tutor_help": "勾选后，学生可在解题时请求提示，每次使用都会记入报告。默认关闭——日常练习可开启，正式考试建议关闭。",
  "teacher.class.assignment_hint_count": "已使用 {count} 次提示",
  "teacher.class.progress_column_hints": "提示次数",

  "teacher.upload.title": "上传题目集",
  "teacher.upload.subtitle":
    "粘贴 teacher-v1 JSON。上传后系统会自动为证明题生成里程碑检查列表。",
  "teacher.upload.paste_label": "题目集 JSON",
  "teacher.upload.auto_assign_label": "同时布置给班级（可选）",
  "teacher.upload.submit": "上传",
  "teacher.upload.success": "上传成功：{count} 题；其中 {proofs} 道证明题已进入预处理。",
  "teacher.upload.preview_button": "预览",
  "teacher.upload.commit_button": "提交上传",
  "teacher.upload.no_class_option": "暂不布置",
  "teacher.upload.cta_from_home": "上传题目集",
  "teacher.upload.cta_from_home_desc": "粘贴 JSON 或自己编写的题目集，快速加入题库。",

  "teacher.class.back_to_teacher": "返回控制台",
  "teacher.class.copy_join_code": "复制加入码",
  "teacher.class.copy_join_code_done": "已复制！",
  "teacher.class.join_code_hint": "学生在「加入班级」页面输入该加入码即可自助加入。",
  "teacher.class.no_students": "还没有学生加入。",
  "teacher.class.no_assignments": "还没有作业。",
  "teacher.class.view_progress": "查看进度",
  "teacher.class.remove_student": "移除",
  "teacher.class.confirm_remove_student": "确认将该学生移出班级？其历史作答记录仍会保留。",
  "teacher.class.regenerate_join_code": "重新生成加入码",
  "teacher.class.regenerate_join_code_confirm": "重新生成加入码后，旧加入码将立即失效，继续吗？",
  "teacher.class.progress_title": "作业进度",
  "teacher.class.progress_column_student": "学生",
  "teacher.class.progress_column_status": "状态",
  "teacher.class.progress_column_progress": "已作答",
  "teacher.class.progress_column_correct": "正确",
  "teacher.class.progress_column_submitted": "提交于",
  "teacher.class.progress_close": "关闭",
  "teacher.class.status_completed": "已完成",
  "teacher.class.status_in_progress": "进行中",
  "teacher.class.status_not_started": "未开始",

  "teacher.invite_result.added": "已邀请",
  "teacher.invite_result.already_in_class": "已在本班",
  "teacher.invite_result.seat_full": "学生名额已满",
  "teacher.invite_result.email_in_other_org": "该邮箱已属于其他学校",

  "student.home.title": "我的作业",
  "student.home.subtitle": "关注即将到期的作业，也可以回看之前做过的练习。",
  "student.home.empty_assignments": "暂时没有作业，老师布置后会显示在这里。",
  "student.home.empty_classes": "你还没加入任何班级。向老师索取 6 位加入码，即可自助加入。",
  "student.home.due_in": "{days} 天后截止",
  "student.home.due_today": "今天截止",
  "student.home.due_tomorrow": "明天截止",
  "student.home.no_due": "无截止时间",
  "student.home.overdue": "已逾期",
  "student.home.completed": "已完成",
  "student.home.in_progress": "进行中",
  "student.home.not_started": "未开始",
  "student.home.classes_card": "班级",
  "student.home.upcoming_card": "待完成",
  "student.home.overdue_card": "已逾期",
  "student.home.completed_card": "已完成",
  "student.home.start_button": "开始",
  "student.home.continue_button": "继续",
  "student.home.review_button": "回看",
  "student.home.progress_line": "已作答 {attempted}/{total}，正确 {correct}",
  "student.home.classes_heading": "我的班级",
  "student.home.assignments_heading": "作业",
  "student.home.section_upcoming": "待完成 / 进行中",
  "student.home.section_overdue": "已逾期",
  "student.home.section_completed": "已完成",
  "student.home.open_report": "查看报告",
  "student.home.assignment_from": "来自 {className}",
  "student.home.problem_count": "共 {count} 题",

  "student.join.title": "加入班级",
  "student.join.subtitle": "输入老师给你的 6 位加入码，不区分大小写。",
  "student.join.code_label": "输入老师给你的加入码",
  "student.join.submit": "加入",
  "student.join.success": "已成功加入 {className}！",
  "student.join.already_enrolled": "你已经在 {className} 中。",
  "student.join.not_found": "加入码无效，请再核对一下老师给你的代码。",
  "student.join.cross_org": "你已加入其他学校的班级。如需更换学校，请联系老师或管理员。",
  "student.join.seat_full": "该学校的学生名额已用完，请老师联系管理员扩容。",

  "problems.page.badge": "AI 辅导",
  "problems.page.title": "题目练习",
  "problems.page.subtitle": "选一份诊断测验开始，或按竞赛浏览练习题集。",
  "problems.diagnostic.heading": "免费诊断测试",
  "problems.diagnostic.subtitle": "整套测验定位，提交一次后生成报告并追踪进度。",
  "problems.diagnostic.start_button": "开始测试",
  "problems.diagnostic.problem_count": "{count} 题",
  "problems.diagnostic.tag": "诊断测试",
  "problems.competitions.heading": "竞赛",
  "problems.competitions.subtitle": "选择竞赛浏览相应练习题集。可在搜索框按年份或试卷过滤。",
  "problems.browser.search_placeholder": "按年份或试卷搜索…",
  "problems.browser.no_results": "没有匹配的题集。",
  "problems.browser.problem_count": "{count} 题",
  "problems.browser.exam_label": "试卷 {exam}",
  "problems.browser.year_label": "{year} 年",
  "problems.browser.real_exam_tag": "真题",
  "problems.browser.topic_practice_tag": "专题练习",
  "problems.browser.locked": "已锁定",
  "problems.browser.open": "打开",
  "problems.browser.unlock": "解锁",
  "problems.browser.back_all": "← 所有竞赛",
  "problems.browser.set_count": "{count} 套",
  "problems.browser.problem_total": "{count} 题",
  "problems.browser.contest.AMC8.full": "AMC 8",
  "problems.browser.contest.AMC8.short": "初中竞赛 · 选择题",
  "problems.browser.contest.AMC10.full": "AMC 10",
  "problems.browser.contest.AMC10.short": "高中初阶 · 选择题",
  "problems.browser.contest.AMC12.full": "AMC 12",
  "problems.browser.contest.AMC12.short": "高中高阶 · 选择题",
  "problems.browser.contest.AIME.full": "AIME",
  "problems.browser.contest.AIME.short": "美国邀请赛 · 整数答案",
  "problems.browser.contest.USAMO.full": "USAMO",
  "problems.browser.contest.USAMO.short": "美国奥数 · 证明题",
  "problems.browser.contest.USAJMO.full": "USAJMO",
  "problems.browser.contest.USAJMO.short": "美国少年奥数 · 证明题",
  "problems.browser.contest.IMO.full": "IMO",
  "problems.browser.contest.IMO.short": "国际数学奥赛 · 证明题",
  "problems.browser.contest.CMO.full": "中国数学奥赛 (CMO)",
  "problems.browser.contest.CMO.short": "中国数学奥林匹克 · 证明题",
  "problems.browser.contest.PUTNAM.full": "Putnam",
  "problems.browser.contest.PUTNAM.short": "美国大学生数学竞赛 · 证明题",
  "problems.browser.contest.PRACTICE.full": "练习题",
  "problems.browser.contest.PRACTICE.short": "ArcMath 自创热身题 · 非真题",
  "problems.browser.contest.EUCLID.full": "Euclid 滑铁卢竞赛",
  "problems.browser.contest.EUCLID.short": "加拿大 CEMC / 滑铁卢大学 · 短答 + 长解题",
  "problems.browser.contest.MAT.full": "MAT 牛津数学入学测试",
  "problems.browser.contest.MAT.short": "牛津与帝国理工招生考 · 选择题 + 长解题",
  "problems.browser.contest.STEP.full": "STEP 剑桥数学考",
  "problems.browser.contest.STEP.short": "剑桥 Sixth Term · 长卷 I / II / III",

  "home.hero.kicker": "ArcMath 学习工作台",
  "home.hero.headline": "让学生专注、家长清晰的数学练习平台。",
  "home.hero.subhead": "从竞赛题到作业和报告，ArcMath 把所有内容整合到一个清爽、现代、易信任的学习工作台中。",
  "home.hero.pill_practice": "结构化练习",
  "home.hero.pill_progress": "进度一目了然",
  "home.hero.pill_aesthetic": "精致科技风",
  "home.hero.cta_dashboard": "打开仪表板",
  "home.hero.cta_browse_problems": "浏览题库",
  "home.hero.cta_create_account": "注册账号",
  "home.hero.cta_sign_in": "登录",
  "home.stats.practice_label": "练习流程",
  "home.stats.practice_value": "引导式",
  "home.stats.practice_desc": "从精选题集顺畅过渡到专注解题，不被打断节奏。",
  "home.stats.parent_label": "家长视图",
  "home.stats.parent_value": "清晰",
  "home.stats.parent_desc": "作业与进度一眼看懂，无需多余翻找。",
  "home.stats.library_label": "竞赛题库",
  "home.stats.library_value": "井然有序",
  "home.stats.library_desc": "升学考试与竞赛资源整齐归档，工作台不显拥挤。",
  "home.cards.students_title": "面向学生",
  "home.cards.students_body": "在持续阅读体验良好的界面里，安心进入更长时段的专注解题。",
  "home.cards.parents_title": "面向家长",
  "home.cards.parents_body": "随时查看已布置、已完成和下一步重点，无需额外询问。",
  "home.cards.coaches_title": "面向教练",
  "home.cards.coaches_body": "在更整洁、易导航的工作台里组织和管理练习内容。",
  "home.helps.kicker": "ArcMath 解决什么问题",
  "home.helps.headline": "结构化练习，但不让人感到沉重。",
  "home.helps.subhead": "平台旨在支持稳步进步：让练习真正有意义，让追进度可视化，少花时间寻找下一步。",
  "home.helps.assignments_title": "作业",
  "home.helps.assignments_body": "把大目标拆成清晰可控的练习单元。",
  "home.helps.resources_title": "资源",
  "home.helps.resources_body": "把官方试卷、精选题集与辅导材料集中在一处。",
  "home.helps.guided_title": "引导式辅助",
  "home.helps.guided_body": "卡壳时帮学生继续推进，避免中途丧失信心。",
  "home.helps.reports_title": "学情报告",
  "home.helps.reports_body": "为家长和教练呈现成长、节奏与下阶段重点。",
  "home.quickstart.badge_member": "继续学习",
  "home.quickstart.badge_guest": "快速开始",
  "home.quickstart.title_member": "回到你的学习流程。",
  "home.quickstart.title_guest": "用清爽简单的设置开始。",
  "home.quickstart.body_member": "主要功能就在手边，随时打开继续。",
  "home.quickstart.body_guest": "注册学生账号或登录，以个性化你的仪表板、作业与报告。",
  "home.quickstart.role_member": "会员",
  "home.quickstart.role_guest": "访客",
  "home.quickstart.link_dashboard": "打开仪表板",
  "home.quickstart.link_browse_problems": "浏览题库",
  "home.quickstart.link_assignments": "查看作业",
  "home.quickstart.link_resources": "查看资源",
  "home.quickstart.link_create": "注册账号",
  "home.quickstart.link_signin": "登录"
};

export const MESSAGES: Record<Locale, Messages> = {
  en: EN,
  zh: ZH
};

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

/**
 * Interpolates `{variable}` placeholders in a message with values from
 * `vars`. Unknown variables become empty strings. Used by both the server
 * helper and the client hook so the behaviour stays identical.
 */
export function formatMessage(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

/**
 * Server- or client-safe translator factory. Exposed from this neutral
 * module (rather than `client.tsx`) so server components can import it
 * without crossing the React Server Components boundary — Next.js 16's
 * stricter RSC enforcement rejects calling functions defined in
 * `"use client"` modules from server contexts at runtime.
 */
export function translatorImpl(locale: Locale) {
  const dict = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  return (
    key: keyof Messages,
    vars?: Record<string, string | number>
  ): string => formatMessage(dict[key] ?? key, vars);
}
