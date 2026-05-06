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

  "login.kicker": string;
  "login.headline": string;
  "login.subhead": string;
  "login.stat_student_label": string;
  "login.stat_student_body": string;
  "login.stat_parent_label": string;
  "login.stat_parent_body": string;
  "login.badge": string;
  "login.title": string;
  "login.subtitle": string;
  "login.email_label": string;
  "login.password_label": string;
  "login.submit": string;
  "login.submit_loading": string;
  "login.error_invalid": string;
  "login.first_time_help": string;
  "login.first_time_link": string;
  "login.first_time_suffix": string;
  "login.admin_create_prefix": string;
  "login.admin_create_link": string;

  "set_password.badge": string;
  "set_password.title": string;
  "set_password.subtitle": string;
  "set_password.username_label": string;
  "set_password.username_placeholder": string;
  "set_password.new_password_label": string;
  "set_password.confirm_password_label": string;
  "set_password.submit": string;
  "set_password.submit_loading": string;
  "set_password.error_short": string;
  "set_password.error_mismatch": string;
  "set_password.error_generic": string;
  "set_password.error_network": string;
  "set_password.already_set_prefix": string;
  "set_password.already_set_link": string;

  "register.title": string;
  "register.subtitle": string;
  "register.name_label": string;
  "register.email_label": string;
  "register.password_label": string;
  "register.password_help": string;
  "register.submit": string;
  "register.submit_loading": string;
  "register.error_email_in_use": string;
  "register.error_generic": string;
  "register.signin_prefix": string;
  "register.signin_link": string;

  "resources.title": string;
  "resources.subtitle": string;
  "resources.publish_heading": string;
  "resources.publish_help": string;
  "resources.title_label": string;
  "resources.description_label": string;
  "resources.content_label": string;
  "resources.attachment_label": string;
  "resources.publish_submit": string;
  "resources.published_heading": string;
  "resources.published_help_uploader": string;
  "resources.published_help_viewer": string;
  "resources.no_resources": string;
  "resources.posted_by": string;
  "resources.posted_at": string;
  "resources.attachment_link": string;
  "resources.created_success": string;

  "problemset.problems_heading": string;
  "problemset.solo_run_button": string;
  "problemset.continue_run_button": string;
  "problemset.review_run_button": string;
  "problemset.problem_label": string;
  "problemset.no_attempt_yet": string;
  "problemset.attempt_correct": string;
  "problemset.attempt_incorrect": string;
  "problemset.attempt_pending": string;
  "problemset.back_to_catalog": string;
  "problemset.start_practice": string;
  "problemset.problem_list_help": string;
  "problemset.open_tutor": string;
  "problemset.open_problem": string;
  "problemset.total_problems": string;

  "attempt.badge_real_set": string;
  "attempt.problem_n_of": string;
  "attempt.back_to_set": string;
  "attempt.next_problem": string;
  "attempt.view_report": string;
  "attempt.choices_diagram_label": string;
  "attempt.reveal_official_solution": string;
  "attempt.no_official_solution": string;
  "attempt.workspace_title_default": string;
  "attempt.workspace_title_proof": string;
  "attempt.workspace_subtitle_answer_only": string;
  "attempt.workspace_subtitle_stuck": string;
  "attempt.workspace_subtitle_hint_guided": string;
  "attempt.workspace_subtitle_proof": string;
  "attempt.add_step_label": string;
  "attempt.add_step_button": string;
  "attempt.show_hint_n": string;
  "attempt.loading_hint": string;
  "attempt.all_hints_used": string;
  "attempt.try_writing_steps": string;
  "attempt.got_an_answer": string;
  "attempt.stuck_show_hint_n": string;
  "attempt.final_answer_label_optional": string;
  "attempt.final_answer_placeholder": string;
  "attempt.submit_button": string;
  "attempt.start_over": string;
  "attempt.entry_choose_title": string;
  "attempt.entry_choose_subtitle": string;
  "attempt.entry_answer_only_title": string;
  "attempt.entry_answer_only_body": string;
  "attempt.entry_stuck_title": string;
  "attempt.entry_stuck_body": string;
  "attempt.entry_hint_guided_title": string;
  "attempt.entry_hint_guided_body": string;
  "attempt.entry_proof_title": string;
  "attempt.entry_proof_body": string;
  "attempt.entry_pick": string;
  "attempt.review_correct": string;
  "attempt.review_incorrect": string;
  "attempt.review_correct_answer_was": string;
  "attempt.hint_label": string;
  "attempt.hint_used_count": string;
  "attempt.step_n_label": string;
  "attempt.step_edit": string;
  "attempt.step_save": string;
  "attempt.step_cancel": string;
  "attempt.step_delete": string;
  "attempt.step_confirm_delete": string;
  "attempt.tutor_note": string;
  "attempt.loading_state": string;
  "attempt.submitting": string;
  "attempt.submit_answer": string;
  "attempt.select_your_answer": string;
  "attempt.your_answer_label": string;
  "attempt.your_answer_placeholder": string;
  "attempt.integer_placeholder": string;
  "attempt.starting": string;
  "attempt.start_proof_attempt": string;
  "attempt.proof_workspace_help": string;
  "attempt.submit_for_review": string;
  "attempt.grading": string;
  "attempt.submit_row_proof": string;
  "attempt.submit_row_default": string;
  "attempt.mode_badge_answer_only": string;
  "attempt.mode_badge_stuck": string;
  "attempt.mode_badge_hint_guided": string;
  "attempt.mode_badge_proof": string;
  "attempt.mode_badge_submitted_suffix": string;
  "attempt.verdict_verified": string;
  "attempt.verdict_plausible": string;
  "attempt.verdict_unknown": string;
  "attempt.verdict_invalid": string;
  "attempt.verdict_error": string;
  "attempt.verdict_pending": string;
  "attempt.verdict_checked_by": string;
  "attempt.review_answer_label": string;
  "attempt.review_correct_short": string;
  "attempt.review_incorrect_short": string;
  "attempt.review_your_answer": string;
  "attempt.review_submitted_at": string;
  "attempt.review_overall_label": string;
  "attempt.review_hints_used": string;
  "attempt.review_start_new": string;
  "attempt.entry_intro": string;
  "attempt.entry_card_solved_title": string;
  "attempt.entry_card_solved_body": string;
  "attempt.entry_card_stuck_title": string;
  "attempt.entry_card_stuck_body": string;
  "attempt.entry_card_no_idea_title": string;
  "attempt.entry_card_no_idea_body": string;
  "attempt.coverage_heading": string;
  "attempt.coverage_status_established": string;
  "attempt.coverage_status_replaced": string;
  "attempt.coverage_status_partial": string;
  "attempt.coverage_status_missing": string;
  "attempt.coverage_status_invalid": string;
  "attempt.coverage_milestone_label": string;
  "attempt.error_failed_start_attempt": string;
  "attempt.error_failed_change_mode": string;
  "attempt.error_failed_add_step": string;
  "attempt.error_failed_edit_step": string;
  "attempt.error_failed_delete_step": string;
  "attempt.error_failed_fetch_hint": string;
  "attempt.error_failed_submit": string;
  "attempt.error_failed_start_new": string;


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
  "org.overview.class_join_code": string;
  "org.overview.class_join_code_copy": string;
  "org.overview.create_class_heading": string;
  "org.overview.create_class_name_label": string;
  "org.overview.create_class_teacher_label": string;
  "org.overview.create_class_submit": string;
  "org.overview.create_class_no_teachers": string;
  "org.overview.create_class_roster_help": string;
  "org.overview.create_class_teacher_name_label": string;
  "org.overview.create_class_teacher_name_placeholder": string;
  "org.overview.create_class_student_names_label": string;
  "org.overview.create_class_student_names_placeholder": string;
  "org.overview.create_class_student_names_help": string;
  "org.overview.create_class_student_row_placeholder": string;
  "org.overview.create_class_student_rows_help": string;
  "org.overview.roster_kind_new": string;
  "org.overview.roster_kind_existing": string;
  "org.overview.roster_no_existing_teachers": string;
  "org.overview.roster_add_row": string;
  "org.overview.roster_remove_row": string;
  "org.overview.credentials_heading": string;
  "org.overview.credentials_help": string;
  "org.overview.credentials_done": string;
  "org.overview.credentials_role": string;
  "org.overview.credentials_name": string;
  "org.overview.credentials_username": string;
  "org.overview.credentials_status": string;
  "org.overview.credentials_status_new": string;
  "org.overview.credentials_status_existing": string;
  "org.overview.credentials_copy_all": string;
  "org.overview.reset_password_label": string;
  "org.overview.reset_password_confirm": string;
  "org.overview.reset_password_help": string;
  "org.overview.reset_password_done": string;
  "org.overview.reset_password_error": string;
  "org.overview.class_enrolled_students_heading": string;
  "org.overview.class_no_enrollments": string;
  "org.overview.class_remove_student_label": string;
  "org.overview.class_remove_student_confirm": string;
  "org.overview.class_add_student_heading": string;
  "org.overview.class_add_student_submit": string;
  "org.overview.class_no_more_existing": string;
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
  "teacher.classes.created_by_admin_help": string;

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
  "teacher.class.roster_managed_by_admin": string;
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

  "login.kicker": "Welcome Back",
  "login.headline": "Sign in to continue your workflow.",
  "login.subhead": "A cleaner interface makes it easier to move from login to practice, reports, and assignments without losing momentum.",
  "login.stat_student_label": "Student Mode",
  "login.stat_student_body": "Get back to problems quickly with less visual clutter.",
  "login.stat_parent_label": "Parent View",
  "login.stat_parent_body": "Check progress and assignments in a layout that feels organized and calm.",
  "login.badge": "Account Access",
  "login.title": "Sign in",
  "login.subtitle": "Use your ArcMath email and password to continue.",
  "login.email_label": "Email",
  "login.password_label": "Password",
  "login.submit": "Sign in",
  "login.submit_loading": "Signing in...",
  "login.error_invalid": "Invalid email or password.",
  "login.first_time_help": "First time signing in? Your school admin gave you a username ending in @<school>.arcmath.local —",
  "login.first_time_link": "set your password here",
  "login.first_time_suffix": ".",
  "login.admin_create_prefix": "School admins:",
  "login.admin_create_link": "create your account",

  "set_password.badge": "First-time setup",
  "set_password.title": "Set your password",
  "set_password.subtitle": "Enter the username your school admin gave you, then choose a password. After that you'll sign in with that password from now on.",
  "set_password.username_label": "Username (email-format)",
  "set_password.username_placeholder": "wang.wei.7f3a@northstar.arcmath.local",
  "set_password.new_password_label": "New password (min 8 characters)",
  "set_password.confirm_password_label": "Confirm password",
  "set_password.submit": "Set password and sign in",
  "set_password.submit_loading": "Setting password...",
  "set_password.error_short": "Password must be at least 8 characters.",
  "set_password.error_mismatch": "Passwords don't match.",
  "set_password.error_generic": "Could not set password. Check your username with your admin.",
  "set_password.error_network": "Network error. Try again.",
  "set_password.already_set_prefix": "Already set a password?",
  "set_password.already_set_link": "Sign in here",

  "register.title": "Create your school admin account",
  "register.subtitle": "Use this to bootstrap a new school. After creating your account you can set up your school and add teachers + students.",
  "register.name_label": "Your name",
  "register.email_label": "Email",
  "register.password_label": "Password",
  "register.password_help": "At least 8 characters.",
  "register.submit": "Create account",
  "register.submit_loading": "Creating...",
  "register.error_email_in_use": "That email is already registered.",
  "register.error_generic": "Could not create your account. Try again.",
  "register.signin_prefix": "Already have an account?",
  "register.signin_link": "Sign in",

  "resources.title": "Course materials",
  "resources.subtitle": "PDFs, lesson notes, and links shared across your school.",
  "resources.publish_heading": "Publish resource",
  "resources.publish_help": "Lesson notes, PDFs, study guides, links, or an attached worksheet. Visible to everyone in your school. (Teachers and admins can publish.)",
  "resources.title_label": "Title",
  "resources.description_label": "Description",
  "resources.content_label": "Content",
  "resources.attachment_label": "Attachment (max 15 MB)",
  "resources.publish_submit": "Publish Resource",
  "resources.published_heading": "Published resources",
  "resources.published_help_uploader": "Everything posted here is visible to students in this organization.",
  "resources.published_help_viewer": "These materials are shared by your teachers and school admins.",
  "resources.no_resources": "No resources published yet.",
  "resources.posted_by": "Posted by",
  "resources.posted_at": "Posted",
  "resources.attachment_link": "Open attachment",
  "resources.created_success": "Resource published successfully.",

  "problemset.problems_heading": "Problems",
  "problemset.solo_run_button": "Start practice run",
  "problemset.continue_run_button": "Continue",
  "problemset.review_run_button": "Review",
  "problemset.problem_label": "Problem {number}",
  "problemset.no_attempt_yet": "Not attempted",
  "problemset.attempt_correct": "Correct",
  "problemset.attempt_incorrect": "Incorrect",
  "problemset.attempt_pending": "In progress",
  "problemset.back_to_catalog": "Back to Catalog",
  "problemset.start_practice": "Start Practice",
  "problemset.problem_list_help": "Open any problem below to use the hint tutor (when the teacher has enabled it), submit your answer, and move through the set.",
  "problemset.open_tutor": "Open Tutor",
  "problemset.open_problem": "Open Problem",
  "problemset.total_problems": "{count} problems",

  "attempt.badge_real_set": "Premium Real Set",
  "attempt.problem_n_of": "Problem {current} of {total}",
  "attempt.back_to_set": "Back to Set",
  "attempt.next_problem": "Next Problem",
  "attempt.view_report": "View Report",
  "attempt.choices_diagram_label": "Choice diagram",
  "attempt.reveal_official_solution": "Reveal official solution",
  "attempt.no_official_solution": "Official solution not yet available for this problem.",
  "attempt.workspace_title_default": "Answer Workspace",
  "attempt.workspace_title_proof": "Proof Workspace",
  "attempt.workspace_subtitle_answer_only": "You told us you've solved it — submit your answer below.",
  "attempt.workspace_subtitle_stuck": "Write the steps you tried. Submit when you're ready — we'll check each one.",
  "attempt.workspace_subtitle_hint_guided": "Take hints one at a time. Switch to writing steps or typing an answer whenever you're ready.",
  "attempt.workspace_subtitle_proof": "Build your proof step by step. Everything gets verified on submit.",
  "attempt.add_step_label": "Add step {n}",
  "attempt.add_step_button": "Add step",
  "attempt.show_hint_n": "Show hint {n}",
  "attempt.loading_hint": "Loading hint…",
  "attempt.all_hints_used": "All 3 hints used",
  "attempt.try_writing_steps": "I'll try writing steps now",
  "attempt.got_an_answer": "I've got an answer",
  "attempt.stuck_show_hint_n": "Stuck — show hint {n}",
  "attempt.final_answer_label_optional": "Final answer (optional — submit only if you're reasonably confident)",
  "attempt.final_answer_placeholder": "Leave blank if you didn't reach a confident answer",
  "attempt.submit_button": "Submit",
  "attempt.start_over": "Start over",
  "attempt.entry_choose_title": "How are you solving this?",
  "attempt.entry_choose_subtitle": "Pick how you'd like to work — you can always switch later.",
  "attempt.entry_answer_only_title": "I have the answer",
  "attempt.entry_answer_only_body": "Type your final answer right away.",
  "attempt.entry_stuck_title": "I have some work",
  "attempt.entry_stuck_body": "Write down your steps; we'll check each one when you submit.",
  "attempt.entry_hint_guided_title": "Walk me through it",
  "attempt.entry_hint_guided_body": "Get up to 3 hints, then submit when you've got it.",
  "attempt.entry_proof_title": "Write a proof",
  "attempt.entry_proof_body": "Build a step-by-step proof; we verify on submit.",
  "attempt.entry_pick": "Pick this",
  "attempt.review_correct": "Correct ✓",
  "attempt.review_incorrect": "Incorrect",
  "attempt.review_correct_answer_was": "Correct answer: {answer}",
  "attempt.hint_label": "Hint {level}",
  "attempt.hint_used_count": "Hints used: {count}",
  "attempt.step_n_label": "Step {n}",
  "attempt.step_edit": "Edit",
  "attempt.step_save": "Save",
  "attempt.step_cancel": "Cancel",
  "attempt.step_delete": "Delete",
  "attempt.step_confirm_delete": "Delete this step? This cannot be undone.",
  "attempt.tutor_note": "Tutor note",
  "attempt.loading_state": "Loading…",
  "attempt.submitting": "Submitting…",
  "attempt.submit_answer": "Submit answer",
  "attempt.select_your_answer": "Select your answer",
  "attempt.your_answer_label": "Your answer",
  "attempt.your_answer_placeholder": "Your answer",
  "attempt.integer_placeholder": "Integer, e.g. 42",
  "attempt.starting": "Starting…",
  "attempt.start_proof_attempt": "Start proof attempt",
  "attempt.proof_workspace_help": "Write your proof one step at a time. Nothing is verified until you submit.",
  "attempt.submit_for_review": "Submit for review",
  "attempt.grading": "Grading…",
  "attempt.submit_row_proof": "Done writing? We'll verify each step and give you an overall review.",
  "attempt.submit_row_default": "Submit when you're ready. We'll review every step and grade your answer if you wrote one.",
  "attempt.mode_badge_answer_only": "Direct answer",
  "attempt.mode_badge_stuck": "With work",
  "attempt.mode_badge_hint_guided": "Hints",
  "attempt.mode_badge_proof": "Proof",
  "attempt.mode_badge_submitted_suffix": "submitted",
  "attempt.verdict_verified": "Verified",
  "attempt.verdict_plausible": "Plausible",
  "attempt.verdict_unknown": "Unverified",
  "attempt.verdict_invalid": "Invalid",
  "attempt.verdict_error": "Parse error",
  "attempt.verdict_pending": "Not yet checked",
  "attempt.verdict_checked_by": "Checked by {backend}",
  "attempt.review_answer_label": "Answer",
  "attempt.review_correct_short": "✓ correct",
  "attempt.review_incorrect_short": "✗ not correct",
  "attempt.review_your_answer": "Your answer",
  "attempt.review_submitted_at": "Submitted {time}",
  "attempt.review_overall_label": "Overall review",
  "attempt.review_hints_used": "Hints used in this attempt: {count}",
  "attempt.review_start_new": "Start a new attempt",
  "attempt.entry_intro": "Try the problem on paper first. Then tell us how it went — we'll tailor the feedback to match.",
  "attempt.entry_card_solved_title": "I've solved it",
  "attempt.entry_card_solved_body": "You're confident — submit your answer and get it graded.",
  "attempt.entry_card_stuck_title": "I tried but got stuck",
  "attempt.entry_card_stuck_body": "Write the steps you tried (LaTeX editor). We'll review each step and help you finish.",
  "attempt.entry_card_no_idea_title": "I have no idea",
  "attempt.entry_card_no_idea_body": "We'll give you progressive hints. You can switch to writing steps any time.",
  "attempt.coverage_heading": "Milestone coverage",
  "attempt.coverage_status_established": "Established",
  "attempt.coverage_status_replaced": "Replaced (alt path)",
  "attempt.coverage_status_partial": "Partial",
  "attempt.coverage_status_missing": "Not reached",
  "attempt.coverage_status_invalid": "Contradicted",
  "attempt.coverage_milestone_label": "Milestone #{index}",
  "attempt.error_failed_start_attempt": "Failed to start attempt.",
  "attempt.error_failed_change_mode": "Failed to change mode.",
  "attempt.error_failed_add_step": "Failed to add step.",
  "attempt.error_failed_edit_step": "Failed to edit step.",
  "attempt.error_failed_delete_step": "Failed to delete step.",
  "attempt.error_failed_fetch_hint": "Failed to fetch hint.",
  "attempt.error_failed_submit": "Failed to submit.",
  "attempt.error_failed_start_new": "Failed to start new attempt.",

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
  "org.overview.class_join_code": "Join code:",
  "org.overview.class_join_code_copy": "Copy",
  "org.overview.create_class_heading": "Create a class",
  "org.overview.create_class_name_label": "Class name",
  "org.overview.create_class_teacher_label": "Assign to teacher",
  "org.overview.create_class_submit": "Create class",
  "org.overview.create_class_no_teachers": "Add a teacher account first, then create classes here.",
  "org.overview.create_class_roster_help": "Caps: {teachers}/{maxTeachers} teachers · {students}/{maxStudents} students. Reuse a name to reuse the existing account.",
  "org.overview.create_class_teacher_name_label": "Teacher name",
  "org.overview.create_class_teacher_name_placeholder": "e.g. Wang Wei or Ms. Lin",
  "org.overview.create_class_student_names_label": "Students",
  "org.overview.create_class_student_names_placeholder": "One name per line, or comma-separated",
  "org.overview.create_class_student_names_help": "Each unique name spawns one student account. Re-using a name reuses the same account.",
  "org.overview.create_class_student_row_placeholder": "Student name",
  "org.overview.create_class_student_rows_help": "One row per student. Pick \"New\" to spawn a fresh account, or \"Existing\" to add a student who's already in the school.",
  "org.overview.roster_kind_new": "New",
  "org.overview.roster_kind_existing": "Existing",
  "org.overview.roster_no_existing_teachers": "no teachers in the school yet",
  "org.overview.roster_add_row": "+ Add another student",
  "org.overview.roster_remove_row": "Remove this student",
  "org.overview.credentials_heading": "New usernames — share these out of band",
  "org.overview.credentials_help": "Send each user their username. They go to /login/set-password and choose their own password the first time.",
  "org.overview.credentials_done": "Done",
  "org.overview.credentials_role": "Role",
  "org.overview.credentials_name": "Name",
  "org.overview.credentials_username": "Username",
  "org.overview.credentials_status": "Status",
  "org.overview.credentials_status_new": "new",
  "org.overview.credentials_status_existing": "existing",
  "org.overview.credentials_copy_all": "Copy all (tab-separated)",
  "org.overview.reset_password_label": "Reset password",
  "org.overview.reset_password_confirm": "Reset this user's password? They'll need to set a new one at /login/set-password.",
  "org.overview.reset_password_help": "Clears the user's password so they re-set it at /login/set-password.",
  "org.overview.reset_password_done": "Reset ✓",
  "org.overview.reset_password_error": "Reset failed",
  "org.overview.class_enrolled_students_heading": "Enrolled",
  "org.overview.class_no_enrollments": "No students enrolled yet.",
  "org.overview.class_remove_student_label": "Remove from class",
  "org.overview.class_remove_student_confirm": "Remove {name} from this class? Their account stays; they just stop seeing this class.",
  "org.overview.class_add_student_heading": "Add a student",
  "org.overview.class_add_student_submit": "Add",
  "org.overview.class_no_more_existing": "no other students in school",
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
  "teacher.classes.created_by_admin_help": "Classes are created by your school admin. If a class you should see is missing, ask the admin to add you to its roster.",

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
  "teacher.class.roster_managed_by_admin":
    "Roster managed by your school admin. To add or remove students, ask your admin to update the class roster.",
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

  "login.kicker": "欢迎回来",
  "login.headline": "登录后继续学习。",
  "login.subhead": "清爽的界面让你从登录到练习、报告、作业一气呵成。",
  "login.stat_student_label": "学生模式",
  "login.stat_student_body": "用更简洁的界面快速回到题目。",
  "login.stat_parent_label": "家长视图",
  "login.stat_parent_body": "在一个井然有序、平静的界面里看到进度和作业。",
  "login.badge": "账号登录",
  "login.title": "登录",
  "login.subtitle": "用你的 ArcMath 用户名和密码继续。",
  "login.email_label": "邮箱 / 用户名",
  "login.password_label": "密码",
  "login.submit": "登录",
  "login.submit_loading": "登录中...",
  "login.error_invalid": "邮箱或密码错误。",
  "login.first_time_help": "首次登录？学校 admin 给你的用户名是以 @<学校>.arcmath.local 结尾的格式 —",
  "login.first_time_link": "在这里设置密码",
  "login.first_time_suffix": "。",
  "login.admin_create_prefix": "学校 admin：",
  "login.admin_create_link": "创建你的账号",

  "set_password.badge": "首次设置",
  "set_password.title": "设置你的密码",
  "set_password.subtitle": "输入学校 admin 给你的用户名，再设置一个密码。设置完成后以后用这个密码登录。",
  "set_password.username_label": "用户名（邮箱格式）",
  "set_password.username_placeholder": "wang.wei.7f3a@northstar.arcmath.local",
  "set_password.new_password_label": "新密码（至少 8 位）",
  "set_password.confirm_password_label": "再次输入密码",
  "set_password.submit": "设置密码并登录",
  "set_password.submit_loading": "设置中...",
  "set_password.error_short": "密码至少 8 个字符。",
  "set_password.error_mismatch": "两次密码不一致。",
  "set_password.error_generic": "设置失败，请向 admin 核对你的用户名。",
  "set_password.error_network": "网络出错，请重试。",
  "set_password.already_set_prefix": "已经设过密码？",
  "set_password.already_set_link": "在这里登录",

  "register.title": "创建学校 admin 账号",
  "register.subtitle": "用此页面注册学校管理员。注册后你可以创建学校并添加老师和学生。",
  "register.name_label": "你的姓名",
  "register.email_label": "邮箱",
  "register.password_label": "密码",
  "register.password_help": "至少 8 个字符。",
  "register.submit": "创建账号",
  "register.submit_loading": "创建中...",
  "register.error_email_in_use": "该邮箱已注册。",
  "register.error_generic": "创建失败，请重试。",
  "register.signin_prefix": "已有账号？",
  "register.signin_link": "登录",

  "resources.title": "教学资源",
  "resources.subtitle": "全校共享的 PDF、讲义和链接。",
  "resources.publish_heading": "发布资源",
  "resources.publish_help": "讲义、PDF、练习册、链接或学习资料附件，全校学生可见。老师和 admin 可发布。",
  "resources.title_label": "标题",
  "resources.description_label": "简介",
  "resources.content_label": "正文",
  "resources.attachment_label": "附件（最大 15 MB）",
  "resources.publish_submit": "发布资源",
  "resources.published_heading": "已发布资源",
  "resources.published_help_uploader": "在此发布的内容全校学生可见。",
  "resources.published_help_viewer": "这些材料由学校老师和 admin 共享。",
  "resources.no_resources": "暂无已发布资源。",
  "resources.posted_by": "发布者",
  "resources.posted_at": "发布时间",
  "resources.attachment_link": "打开附件",
  "resources.created_success": "资源已成功发布。",

  "problemset.problems_heading": "题目",
  "problemset.solo_run_button": "开始练习",
  "problemset.continue_run_button": "继续",
  "problemset.review_run_button": "回看",
  "problemset.problem_label": "第 {number} 题",
  "problemset.no_attempt_yet": "未作答",
  "problemset.attempt_correct": "正确",
  "problemset.attempt_incorrect": "错误",
  "problemset.attempt_pending": "进行中",
  "problemset.back_to_catalog": "返回题库",
  "problemset.start_practice": "开始练习",
  "problemset.problem_list_help": "点击下面任何一道题作答；老师开了 hint 时会有提示导师，提交后自动批改。",
  "problemset.open_tutor": "开始练习（带提示）",
  "problemset.open_problem": "开始练习",
  "problemset.total_problems": "共 {count} 题",

  "attempt.badge_real_set": "真题",
  "attempt.problem_n_of": "第 {current} 题 / 共 {total} 题",
  "attempt.back_to_set": "返回题集",
  "attempt.next_problem": "下一题",
  "attempt.view_report": "查看报告",
  "attempt.choices_diagram_label": "选项图",
  "attempt.reveal_official_solution": "查看官方解答",
  "attempt.no_official_solution": "本题暂无官方解答。",
  "attempt.workspace_title_default": "解题工作台",
  "attempt.workspace_title_proof": "证明工作台",
  "attempt.workspace_subtitle_answer_only": "你已经解出来了——直接提交答案。",
  "attempt.workspace_subtitle_stuck": "写下你尝试过的步骤，提交时我们会逐步检查。",
  "attempt.workspace_subtitle_hint_guided": "一次拿一个提示，准备好时切换到写步骤或填答案。",
  "attempt.workspace_subtitle_proof": "一步步写出证明，提交时统一验证。",
  "attempt.add_step_label": "添加第 {n} 步",
  "attempt.add_step_button": "添加步骤",
  "attempt.show_hint_n": "查看提示 {n}",
  "attempt.loading_hint": "加载提示中…",
  "attempt.all_hints_used": "三次提示已用完",
  "attempt.try_writing_steps": "我来试试写步骤",
  "attempt.got_an_answer": "我有答案了",
  "attempt.stuck_show_hint_n": "卡住了——查看提示 {n}",
  "attempt.final_answer_label_optional": "最终答案（可选——有把握再提交）",
  "attempt.final_answer_placeholder": "若没把握请留空",
  "attempt.submit_button": "提交",
  "attempt.start_over": "重新开始",
  "attempt.entry_choose_title": "你打算怎么解这道题？",
  "attempt.entry_choose_subtitle": "选一种解题方式——之后可以随时切换。",
  "attempt.entry_answer_only_title": "我有答案了",
  "attempt.entry_answer_only_body": "直接填写最终答案。",
  "attempt.entry_stuck_title": "我有些步骤",
  "attempt.entry_stuck_body": "写下你的步骤，提交时逐步批改。",
  "attempt.entry_hint_guided_title": "需要提示",
  "attempt.entry_hint_guided_body": "最多三次提示，准备好后提交。",
  "attempt.entry_proof_title": "写证明",
  "attempt.entry_proof_body": "一步步写证明，提交时验证。",
  "attempt.entry_pick": "选这个",
  "attempt.review_correct": "正确 ✓",
  "attempt.review_incorrect": "错误",
  "attempt.review_correct_answer_was": "正确答案：{answer}",
  "attempt.hint_label": "提示 {level}",
  "attempt.hint_used_count": "已用提示 {count} 次",
  "attempt.step_n_label": "第 {n} 步",
  "attempt.step_edit": "编辑",
  "attempt.step_save": "保存",
  "attempt.step_cancel": "取消",
  "attempt.step_delete": "删除",
  "attempt.step_confirm_delete": "确认删除此步骤？无法撤销。",
  "attempt.tutor_note": "导师批注",
  "attempt.loading_state": "加载中…",
  "attempt.submitting": "提交中…",
  "attempt.submit_answer": "提交答案",
  "attempt.select_your_answer": "选择你的答案",
  "attempt.your_answer_label": "你的答案",
  "attempt.your_answer_placeholder": "你的答案",
  "attempt.integer_placeholder": "整数，例如 42",
  "attempt.starting": "开始中…",
  "attempt.start_proof_attempt": "开始书写证明",
  "attempt.proof_workspace_help": "一步一步写下你的证明，提交后我们会逐步验证。",
  "attempt.submit_for_review": "提交批改",
  "attempt.grading": "批改中…",
  "attempt.submit_row_proof": "写完了？我们会逐步验证并给出整体评语。",
  "attempt.submit_row_default": "准备好就提交吧。我们会逐步检查，并对你的最终答案进行批改（如果有写）。",
  "attempt.mode_badge_answer_only": "直接作答",
  "attempt.mode_badge_stuck": "带过程",
  "attempt.mode_badge_hint_guided": "提示模式",
  "attempt.mode_badge_proof": "证明",
  "attempt.mode_badge_submitted_suffix": "已提交",
  "attempt.verdict_verified": "已验证",
  "attempt.verdict_plausible": "可能正确",
  "attempt.verdict_unknown": "未验证",
  "attempt.verdict_invalid": "错误",
  "attempt.verdict_error": "解析失败",
  "attempt.verdict_pending": "尚未检查",
  "attempt.verdict_checked_by": "由 {backend} 检查",
  "attempt.review_answer_label": "答案",
  "attempt.review_correct_short": "✓ 正确",
  "attempt.review_incorrect_short": "✗ 不正确",
  "attempt.review_your_answer": "你的答案",
  "attempt.review_submitted_at": "提交于 {time}",
  "attempt.review_overall_label": "整体评语",
  "attempt.review_hints_used": "本次尝试使用的提示数：{count}",
  "attempt.review_start_new": "再尝试一次",
  "attempt.entry_intro": "先在草稿纸上试一下。然后告诉我们情况——我们会据此调整反馈方式。",
  "attempt.entry_card_solved_title": "我已经做出来了",
  "attempt.entry_card_solved_body": "对答案有信心——提交后立即批改。",
  "attempt.entry_card_stuck_title": "试了但卡住了",
  "attempt.entry_card_stuck_body": "用 LaTeX 编辑器写下你尝试的步骤，我们会逐步检查并帮你完成。",
  "attempt.entry_card_no_idea_title": "完全没头绪",
  "attempt.entry_card_no_idea_body": "我们会给你逐级提示，随时可以切换到写步骤。",
  "attempt.coverage_heading": "关键节点覆盖",
  "attempt.coverage_status_established": "已完成",
  "attempt.coverage_status_replaced": "走了等价路径",
  "attempt.coverage_status_partial": "部分完成",
  "attempt.coverage_status_missing": "未到达",
  "attempt.coverage_status_invalid": "出现矛盾",
  "attempt.coverage_milestone_label": "节点 #{index}",
  "attempt.error_failed_start_attempt": "无法开始作答。",
  "attempt.error_failed_change_mode": "无法切换模式。",
  "attempt.error_failed_add_step": "无法添加步骤。",
  "attempt.error_failed_edit_step": "无法编辑步骤。",
  "attempt.error_failed_delete_step": "无法删除步骤。",
  "attempt.error_failed_fetch_hint": "无法获取提示。",
  "attempt.error_failed_submit": "提交失败。",
  "attempt.error_failed_start_new": "无法开始新一轮作答。",

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
  "org.overview.class_join_code": "加入码：",
  "org.overview.class_join_code_copy": "复制",
  "org.overview.create_class_heading": "新建班级",
  "org.overview.create_class_name_label": "班级名称",
  "org.overview.create_class_teacher_label": "指派给老师",
  "org.overview.create_class_submit": "创建班级",
  "org.overview.create_class_no_teachers": "请先创建老师账号，再来这里建班级。",
  "org.overview.create_class_roster_help": "上限：{teachers}/{maxTeachers} 老师 · {students}/{maxStudents} 学生。重复输入相同姓名会复用同一账号。",
  "org.overview.create_class_teacher_name_label": "老师姓名",
  "org.overview.create_class_teacher_name_placeholder": "例如：王伟 或 林老师",
  "org.overview.create_class_student_names_label": "学生名单",
  "org.overview.create_class_student_names_placeholder": "每行一位，或用逗号分隔",
  "org.overview.create_class_student_names_help": "同名只创建一个账号；想区分同名学生请加后缀（如\"王伟 A\"、\"王伟 B\"）。",
  "org.overview.create_class_student_row_placeholder": "学生姓名",
  "org.overview.create_class_student_rows_help": "每位学生占一行。选 \"新建\" 会创建新账号，选 \"已有\" 可把现有学生加入此班级。",
  "org.overview.roster_kind_new": "新建",
  "org.overview.roster_kind_existing": "已有",
  "org.overview.roster_no_existing_teachers": "学校暂无老师账号",
  "org.overview.roster_add_row": "+ 再加一位学生",
  "org.overview.roster_remove_row": "移除该学生",
  "org.overview.credentials_heading": "新用户名 — 请线下发给本人",
  "org.overview.credentials_help": "把每位用户名告诉对应的人，他们到 /login/set-password 自行设置密码，老师/学生自己设的密码只有他们自己知道。",
  "org.overview.credentials_done": "完成",
  "org.overview.credentials_role": "角色",
  "org.overview.credentials_name": "姓名",
  "org.overview.credentials_username": "用户名",
  "org.overview.credentials_status": "状态",
  "org.overview.credentials_status_new": "新建",
  "org.overview.credentials_status_existing": "已存在",
  "org.overview.credentials_copy_all": "复制全部（Tab 分隔）",
  "org.overview.reset_password_label": "重置密码",
  "org.overview.reset_password_confirm": "确认重置该用户密码？他们需要在 /login/set-password 重新设置。",
  "org.overview.reset_password_help": "清空该用户密码，他们需要在 /login/set-password 重新设置。",
  "org.overview.reset_password_done": "已重置 ✓",
  "org.overview.reset_password_error": "重置失败",
  "org.overview.class_enrolled_students_heading": "已加入",
  "org.overview.class_no_enrollments": "班级暂无学生。",
  "org.overview.class_remove_student_label": "从班级移除",
  "org.overview.class_remove_student_confirm": "把 {name} 从该班级移除？账号保留，仅不再看到该班级。",
  "org.overview.class_add_student_heading": "添加学生",
  "org.overview.class_add_student_submit": "加入",
  "org.overview.class_no_more_existing": "学校已无其他学生",
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
  "teacher.classes.created_by_admin_help": "班级由学校 admin 统一创建。若你应当看到的班级未显示，请联系 admin 把你加入该班级名册。",

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
  "teacher.class.roster_managed_by_admin": "班级名册由学校 admin 维护。如需增减学生，请联系 admin 修改班级名册。",
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
