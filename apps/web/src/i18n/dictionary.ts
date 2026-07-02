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

  "account.eyebrow": string;
  "account.title": string;
  "account.subtitle": string;
  "account.email_label": string;
  "account.name_label": string;
  "account.language_label": string;
  "account.language_heading": string;
  "account.language_help": string;
  // Split UI vs feedback language (since 2026-05-21). The two prefs
  // are independent — UI in Chinese can still have English feedback,
  // and vice versa.
  "account.ui_language_heading": string;
  "account.ui_language_help": string;
  "account.feedback_language_label": string;
  "account.feedback_language_heading": string;
  "account.feedback_language_help": string;

  // /for-schools landing page (school-outreach funnel).
  "for_schools.eyebrow": string;
  "for_schools.hero_title": string;
  "for_schools.hero_lede": string;
  "for_schools.cta_email": string;
  "for_schools.cta_register_school": string;
  "for_schools.pilot_badge": string;
  "for_schools.why_eyebrow": string;
  "for_schools.why_title": string;
  "for_schools.why_body_1": string;
  "for_schools.why_body_2": string;
  "for_schools.why_callout_label": string;
  "for_schools.why_callout_body": string;
  "for_schools.pillars_eyebrow": string;
  "for_schools.pillars_title": string;
  "for_schools.pillar_1_title": string;
  "for_schools.pillar_1_body": string;
  "for_schools.pillar_2_title": string;
  "for_schools.pillar_2_body": string;
  "for_schools.pillar_3_title": string;
  "for_schools.pillar_3_body": string;
  "for_schools.flow_eyebrow": string;
  "for_schools.flow_title": string;
  "for_schools.flow_1_title": string;
  "for_schools.flow_1_body": string;
  "for_schools.flow_2_title": string;
  "for_schools.flow_2_body": string;
  "for_schools.flow_3_title": string;
  "for_schools.flow_3_body": string;
  "for_schools.flow_4_title": string;
  "for_schools.flow_4_body": string;
  "for_schools.diff_eyebrow": string;
  "for_schools.diff_title": string;
  "for_schools.diff_tutors_title": string;
  "for_schools.diff_tutors_body": string;
  "for_schools.diff_apps_title": string;
  "for_schools.diff_apps_body": string;
  "for_schools.diff_chatbots_title": string;
  "for_schools.diff_chatbots_body": string;
  "for_schools.pilot_eyebrow": string;
  "for_schools.pilot_title": string;
  "for_schools.pilot_body": string;
  "for_schools.pilot_get_title": string;
  "for_schools.pilot_get_1": string;
  "for_schools.pilot_get_2": string;
  "for_schools.pilot_get_3": string;
  "for_schools.pilot_get_4": string;
  "for_schools.pilot_get_5": string;
  "for_schools.pilot_ask_title": string;
  "for_schools.pilot_ask_1": string;
  "for_schools.pilot_ask_2": string;
  "for_schools.pilot_ask_3": string;
  "for_schools.cta_panel_title": string;
  "for_schools.cta_panel_body": string;
  "for_schools.contact_wechat": string;
  "for_schools.contact_email": string;
  "for_schools.contact_founder": string;
  "for_schools.contact_founder_name": string;

  // /me/progress — lifetime student progress report (Phase A).
  "progress.nav_label": string;
  "progress.eyebrow": string;
  "progress.title": string;
  "progress.empty_lede": string;
  "progress.empty_cta": string;
  "progress.hero_lede": string;
  "progress.metric_attempts": string;
  "progress.metric_accuracy": string;
  "progress.metric_time": string;
  "progress.metric_streak": string;
  "progress.plan_eyebrow": string;
  "progress.plan_strength": string;
  "progress.plan_weakness": string;
  "progress.plan_next_moves": string;
  "progress.plan_milestone": string;
  "progress.time_eyebrow": string;
  "progress.time_help": string;
  "progress.hint_eyebrow": string;
  "progress.hint_help": string;
  "progress.cadence_eyebrow": string;
  "progress.cadence_help": string;
  "progress.strengths_eyebrow": string;
  "progress.strengths_empty": string;
  "progress.weaknesses_eyebrow": string;
  "progress.weaknesses_empty": string;
  "progress.attempts_word": string;
  "progress.hints_per_attempt": string;
  "progress.difficulty_eyebrow": string;
  "progress.contest_eyebrow": string;
  "progress.col_contest": string;
  "progress.col_attempts": string;
  "progress.col_accuracy": string;
  "progress.footer_hint": string;
  "progress.footer_link": string;
  // Phase B
  "progress.trend_eyebrow": string;
  "progress.trend_title": string;
  "progress.trend_y_axis": string;
  "progress.trend_empty": string;
  "progress.trend_caption": string;
  "progress.wow_label": string;
  "progress.wow_attempts": string;
  "progress.topic_bars_eyebrow": string;
  "progress.topic_bars_title": string;
  "progress.topic_bars_target": string;
  // Phase C
  "progress.mastery_eyebrow": string;
  "progress.mastery_title": string;
  "progress.mastery_empty": string;
  "progress.mastery_legend": string;
  "progress.mastery_level_0": string;
  "progress.mastery_level_1": string;
  "progress.mastery_level_2": string;
  "progress.mastery_level_3": string;
  "progress.mastery_level_4": string;
  "progress.mastery_level_5": string;
  "progress.mastery_rec_explore": string;
  "progress.mastery_rec_review": string;
  "progress.mastery_rec_progress": string;
  "progress.mastery_rec_advance": string;
  "progress.recommend_eyebrow": string;
  "progress.recommend_title": string;
  "progress.recommend_empty": string;
  "progress.recommend_help": string;
  "progress.recommend_open_cta": string;
  "progress.difficulty_easy": string;
  "progress.difficulty_medium": string;
  "progress.difficulty_hard": string;

  // Solo student panel on /student
  "student.solo.eyebrow": string;
  "student.solo.heading": string;
  "student.solo.body": string;
  "student.solo.cta_problems": string;
  "student.solo.cta_progress": string;

  // /assignments page (org-admin assignment board)
  "assignments.badge": string;
  "assignments.subtitle": string;
  "assignments.back_to_org": string;
  "assignments.published_ok": string;
  "assignments.error_title_required": string;
  "assignments.error_instructions_required": string;
  "assignments.error_forbidden": string;
  "assignments.error_invalid_due_date": string;
  "assignments.publish_heading": string;
  "assignments.publish_body": string;
  "assignments.form_title_label": string;
  "assignments.form_title_placeholder": string;
  "assignments.form_instructions_label": string;
  "assignments.form_instructions_placeholder": string;
  "assignments.form_due_label": string;
  "assignments.form_submit": string;
  "assignments.current_heading": string;
  "assignments.current_help_admin": string;
  "assignments.current_help_student": string;
  "assignments.posted_by": string;
  "assignments.due_label": string;
  "assignments.no_due": string;
  "assignments.empty_state": string;

  // /legal/terms and /legal/privacy
  "legal.eyebrow": string;
  "legal.last_updated": string;
  "legal.contact_heading": string;
  "legal.contact_body": string;
  "legal.terms_title": string;
  "legal.terms_lede": string;
  "legal.terms_h_who": string;
  "legal.terms_body_who": string;
  "legal.terms_h_accounts": string;
  "legal.terms_body_accounts": string;
  "legal.terms_h_acceptable": string;
  "legal.terms_body_acceptable": string;
  "legal.terms_h_content": string;
  "legal.terms_body_content": string;
  "legal.terms_h_ai": string;
  "legal.terms_body_ai": string;
  "legal.terms_h_termination": string;
  "legal.terms_body_termination": string;
  "legal.terms_h_disclaimer": string;
  "legal.terms_body_disclaimer": string;
  "legal.terms_h_changes": string;
  "legal.terms_body_changes": string;
  "legal.privacy_title": string;
  "legal.privacy_lede": string;
  "legal.privacy_h_collect": string;
  "legal.privacy_body_collect": string;
  "legal.privacy_h_use": string;
  "legal.privacy_body_use": string;
  "legal.privacy_h_storage": string;
  "legal.privacy_body_storage": string;
  "legal.privacy_h_third_party": string;
  "legal.privacy_body_third_party": string;
  "legal.privacy_h_retention": string;
  "legal.privacy_body_retention": string;
  "legal.privacy_h_rights": string;
  "legal.privacy_body_rights": string;
  "legal.privacy_h_minors": string;
  "legal.privacy_body_minors": string;

  "login.kicker": string;
  "login.headline": string;
  "login.subhead": string;
  "login.stat_student_label": string;
  "login.stat_student_body": string;
  "login.stat_verification_label": string;
  "login.stat_verification_body": string;
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
  "login.error_unverified": string;
  "login.resend_cta": string;
  "login.resend_loading": string;
  "login.resend_info": string;

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
  "register.eyebrow_student": string;
  "register.success_eyebrow": string;
  "register.success_title": string;
  "register.success_body_prefix": string;
  "register.success_body_suffix": string;
  "register.success_hint": string;
  "register.success_cta_login": string;
  "register.success_change_email": string;
  "register.school_prompt_prefix": string;
  "register.school_prompt_link": string;

  "register_school.eyebrow": string;
  "register_school.title": string;
  "register_school.subtitle": string;
  "register_school.org_name_label": string;
  "register_school.org_name_placeholder": string;
  "register_school.org_name_help": string;
  "register_school.name_label": string;
  "register_school.email_label": string;
  "register_school.password_label": string;
  "register_school.password_help": string;
  "register_school.submit": string;
  "register_school.submit_loading": string;
  "register_school.error_generic": string;
  "register_school.success_eyebrow": string;
  "register_school.success_title": string;
  "register_school.success_body_prefix": string;
  "register_school.success_body_suffix": string;
  "register_school.success_hint": string;
  "register_school.success_cta_login": string;
  "register_school.student_prompt_prefix": string;
  "register_school.student_prompt_link": string;
  "register_school.signin_prefix": string;
  "register_school.signin_link": string;

  "verify_email.eyebrow": string;
  "verify_email.title_success": string;
  "verify_email.title_expired": string;
  "verify_email.title_invalid": string;
  "verify_email.lede_success": string;
  "verify_email.lede_already_used": string;
  "verify_email.lede_expired": string;
  "verify_email.lede_invalid": string;
  "verify_email.lede_missing": string;
  "verify_email.cta_login": string;
  "verify_email.cta_resend": string;
  "verify_email.help_or": string;
  "verify_email.help_signup": string;

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
  "problemset.progress_summary": string;
  "problemset.status_submitted": string;
  "problemset.status_in_progress": string;
  "problemset.cta_review": string;
  "problemset.cta_continue": string;
  "problemset.cta_restart": string;
  "problemset.mode_chooser_eyebrow": string;
  "problemset.mode_chooser_title": string;
  "problemset.mode_chooser_helper": string;
  "problemset.mode_mock_title": string;
  "problemset.mode_mock_body": string;
  "problemset.mode_mock_cta": string;
  "problemset.mode_practice_title": string;
  "problemset.mode_practice_body": string;
  "problemset.mode_practice_cta": string;
  "problemset.mode_chooser_error": string;
  "problemset.mode_badge_mock": string;
  "problemset.mode_badge_practice": string;
  "exam.sidebar_heading": string;
  "exam.sidebar_helper": string;
  "exam.status_answered": string;
  "exam.status_blank": string;
  "exam.status_saving": string;
  "exam.answer_heading": string;
  "exam.integer_placeholder": string;
  "exam.save": string;
  "exam.saved": string;
  "exam.save_error": string;
  "exam.saving": string;
  "exam.saved_at": string;
  "exam.prev": string;
  "exam.next": string;
  "exam.submit_title": string;
  "exam.submit_helper_mock": string;
  "exam.submit_helper_practice": string;
  "exam.submit_cta": string;
  "exam.submit_confirm": string;
  "exam.submitting": string;
  "exam.choice_diagram_heading": string;
  "exam.hint_title": string;
  "exam.hint_get": string;
  "exam.hint_after": string;
  "exam.hint_empty": string;
  "exam.hint_error": string;
  "exam.hint_mock_note": string;
  "exam.hint_exhausted": string;
  "problemset.restart_confirm_title": string;
  "problemset.restart_confirm_body": string;
  "problemset.restart_confirm_yes": string;
  "problemset.restart_confirm_cancel": string;
  "problemset.restart_in_progress": string;
  "problemset.restart_error": string;

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
  "attempt.workspace_subtitle_worked_solution": string;
  "attempt.add_step_label": string;
  "attempt.add_step_button": string;
  "attempt.add_step_grading_inline": string;
  // Handwriting OCR (Sprint 1) — labels on the photo-upload affordance
  // that sits next to MathLive. Confidence variants exist so the UI
  // can shade the resulting toast based on how sure the model was.
  "attempt.ocr_trigger": string;
  "attempt.ocr_resizing": string;
  "attempt.ocr_calling": string;
  "attempt.ocr_hint": string;
  "attempt.ocr_error_generic": string;
  "attempt.ocr_error_too_big": string;
  "attempt.ocr_error_wrong_type": string;
  "attempt.ocr_retry": string;
  "attempt.ocr_confidence_high": string;
  "attempt.ocr_confidence_medium": string;
  "attempt.ocr_confidence_low": string;
  "attempt.ocr_confidence_none": string;
  "attempt.ocr_unavailable": string;
  "attempt.ocr_review_prompt": string;
  // Sprint 2: batch multi-step OCR + per-user daily quota.
  "attempt.ocr_multi_step_trigger": string;
  "attempt.ocr_multi_step_hint": string;
  "attempt.ocr_quota_exceeded": string;
  "attempt.next_step_hint_button": string;
  "attempt.next_step_hint_pending": string;
  "attempt.next_step_hint_label": string;
  "attempt.next_step_hint_help": string;
  "attempt.next_step_hint_dismiss": string;
  "attempt.error_failed_next_step_hint": string;
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
  "attempt.continue_or_restart_label": string;
  "attempt.continue_or_restart_body": string;
  "attempt.continue_or_restart_modal_title": string;
  "attempt.continue_view_submission": string;
  "attempt.continue_or_restart_restart": string;
  "attempt.continue_or_restart_confirm": string;
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
  "attempt.solution_section_n_label": string;
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
  "attempt.submit_row_worked_solution": string;
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
  "attempt.review_ungraded_short": string;
  "attempt.review_ungraded_hint": string;
  "attempt.reveal_official_solution_for_long_question": string;
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

  // Phase C-4: teacher-facing student roster + per-student progress
  // view. Lives under `org.students.*` (sibling of org.overview.*)
  // because semantically it's part of the org admin surface, not the
  // student's own self-view.
  "org.students.eyebrow": string;
  "org.students.title": string;
  "org.students.subtitle": string;
  "org.students.back_to_org": string;
  "org.students.empty": string;
  "org.students.col_name": string;
  "org.students.col_attempts": string;
  "org.students.col_accuracy": string;
  "org.students.col_last_active": string;
  "org.students.row_view": string;
  "org.students.last_active_never": string;
  "org.students.last_active_today": string;
  "org.students.last_active_yesterday": string;
  "org.students.last_active_days_ago": string;
  "org.students.filter_class_label": string;
  "org.students.filter_all_classes": string;
  "org.students.export_csv": string;
  "org.students.csv_col_correct": string;
  "org.students.csv_col_joined": string;
  "org.students.csv_col_classes": string;
  "org.students.parent_invite_heading": string;
  "org.students.parent_invite_helper": string;
  "org.students.parent_invite_email_label": string;
  "org.students.parent_invite_email_placeholder": string;
  "org.students.parent_invite_relationship_label": string;
  "org.students.parent_invite_relationship_placeholder": string;
  "org.students.parent_invite_submit": string;
  "org.students.parent_invite_submitting": string;
  "org.students.parent_invite_success": string;
  "org.students.parent_invite_err_invalid_email": string;
  "org.students.parent_invite_err_generic": string;
  "org.students.lifetime_eyebrow": string;
  "org.students.lifetime_attempts": string;
  "org.students.lifetime_accuracy": string;
  "org.students.lifetime_active_days": string;
  "org.students.lifetime_hint_reliance": string;
  "org.students.strengths_heading": string;
  "org.students.strengths_empty": string;
  "org.students.weaknesses_heading": string;
  "org.students.weaknesses_empty": string;
  "org.students.mastery_eyebrow": string;
  "org.students.mastery_title": string;

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
  "problems.placement.heading": string;
  "problems.placement.subtitle": string;
  "problems.placement.tier_foundation": string;
  "problems.placement.tier_intermediate": string;
  "problems.placement.tier_advanced": string;
  "problems.placement.level_i_desc": string;
  "problems.placement.level_ii_desc": string;
  "problems.placement.level_iii_desc": string;
  "problems.placement.contest_amc8": string;
  "problems.placement.contest_amc10": string;
  "problems.placement.contest_amc12": string;
  "problems.placement.contest_subtitle": string;
  "problems.placement.problems_word": string;
  "problems.amc.heading": string;
  "problems.amc.subtitle": string;
  "problems.other.heading": string;
  "problems.other.subtitle": string;
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
  "home.hero.cta_student": string;
  "home.hero.cta_school": string;
  "home.hero.student_label": string;
  "home.hero.student_tagline": string;
  "home.hero.school_label": string;
  "home.hero.school_tagline": string;
  "home.hero.signin_prompt": string;
  "home.hero.signin_link": string;
  "home.stats.practice_label": string;
  "home.stats.practice_value": string;
  "home.stats.practice_desc": string;
  "home.stats.verification_label": string;
  "home.stats.verification_value": string;
  "home.stats.verification_desc": string;
  "home.stats.library_label": string;
  "home.stats.library_value": string;
  "home.stats.library_desc": string;
  "home.cards.eyebrow": string;
  "home.cards.headline": string;
  "home.cards.lede": string;
  "home.demo.ocr_eyebrow": string;
  "home.demo.ocr_title": string;
  "home.demo.grading_eyebrow": string;
  "home.demo.grading_title": string;
  "home.demo.hint_eyebrow": string;
  "home.demo.hint_title": string;
  "home.demo.report_eyebrow": string;
  "home.demo.report_title": string;
  "home.hero.florid_word": string;
  "home.cards.sympy_title": string;
  "home.cards.sympy_body": string;
  "home.cards.lean_title": string;
  "home.cards.lean_body": string;
  "home.cards.llm_title": string;
  "home.cards.llm_body": string;
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
  "topnav.tagline": "Formally verified competition math",
  "topnav.dashboard": "Dashboard",
  "topnav.organization": "Organization",
  "topnav.assignments": "Assignments",
  "topnav.resources": "Resources",
  "topnav.reports": "Reports",
  "topnav.membership": "Membership",
  "topnav.my_work": "My work",
  "topnav.register": "Register",
  "topnav.account": "Account",

  "account.eyebrow": "Settings",
  "account.title": "Account",
  "account.subtitle": "Update how Arcmath looks and feels for you. More options coming soon.",
  "account.email_label": "Email",
  "account.name_label": "Name",
  "account.language_label": "Interface language",
  "account.language_heading": "Display language",
  "account.language_help": "Controls the language of navigation, page headings, and problem-set chrome. Doesn't change problem text or mentor feedback — those are set separately below.",
  "account.ui_language_heading": "Interface language",
  "account.ui_language_help": "Controls the language of navigation, page headings, and problem-set chrome. Doesn't change problem text or mentor feedback — those are set separately below.",
  "account.feedback_language_label": "Feedback language",
  "account.feedback_language_heading": "Mentor feedback & hints",
  "account.feedback_language_help": "Language used by the AI tutor for step-by-step feedback, hints, and the final review. Defaults to English because the competition exams themselves are in English; switch to Chinese if you'd prefer reading explanations in 中文.",

  "for_schools.eyebrow": "For international schools",
  "for_schools.hero_title": "AI-powered competition math, step by step.",
  "for_schools.hero_lede": "Arcmath is the competition-math platform international schools use to give every student step-by-step feedback on every step — without burning out the teaching team. 2026–2027 free pilot now open for five schools.",
  "for_schools.cta_email": "Email us about the pilot",
  "for_schools.cta_register_school": "Create a school account",
  "for_schools.pilot_badge": "5 free school slots — full academic year, full feature access, your students keep their accounts.",
  "for_schools.why_eyebrow": "Why this matters",
  "for_schools.why_title": "Strong math results need teacher hours teachers don't have.",
  "for_schools.why_body_1": "International schools with strong math programs increasingly compete on AMC, AIME, and Olympiad results — and rightly so. Those credentials open doors at the most selective universities. But the bottleneck is rarely student talent. It is teacher time.",
  "for_schools.why_body_2": "Step-by-step feedback on a proof, on a wrong-by-one-sign answer — that is the kind of feedback that actually moves a student from 80 on the AMC10 to 130. A single teacher with thirty students cannot read thirty proofs, line by line, three times a week.",
  "for_schools.why_callout_label": "The realistic ratio today",
  "for_schools.why_callout_body": "1 math coach : 30 students ≈ 6 minutes of feedback per student per week. Arcmath gives every student step-by-step feedback on every step they write, without any teacher in the loop.",
  "for_schools.pillars_eyebrow": "What Arcmath is",
  "for_schools.pillars_title": "Three pillars that work together.",
  "for_schools.pillar_1_title": "AI step-by-step grading",
  "for_schools.pillar_1_body": "Students type each step in a math-aware editor. The grading engine (SymPy + Lean + an LLM judge) reads every step and returns VERIFIED / NEEDS REVIEW / INCORRECT, plus one short tutor note in plain English (or Chinese).",
  "for_schools.pillar_2_title": "Real exam library",
  "for_schools.pillar_2_body": "AMC 8/10/12, AIME, Putnam, USAMO, Euclid, MAT, STEP — sourced from official archives, typeset in LaTeX, tagged by topic and difficulty. Multiple years per contest so students can take a fresh paper end-to-end.",
  "for_schools.pillar_3_title": "Teacher dashboard + auto reports",
  "for_schools.pillar_3_body": "Each student's mistake pattern surfaced by topic, by difficulty, by hint-usage. Weekly auto-generated learning reports — the conversation you'd want at parent-teacher night, written for you.",
  "for_schools.flow_eyebrow": "How a session looks",
  "for_schools.flow_title": "From opening a problem to receiving the report — four moves.",
  "for_schools.flow_1_title": "Pick a problem.",
  "for_schools.flow_1_body": "Student opens AMC10 2022 problem 18 (or any real paper in the library) from the problem browser.",
  "for_schools.flow_2_title": "Write a step. See feedback immediately.",
  "for_schools.flow_2_body": "Each line of working triggers the grader. Inside ~3 seconds the student sees a verdict and a one-line tutor note. Stuck? Tap 'Hint for next step' for a forward-looking nudge.",
  "for_schools.flow_3_title": "Submit when done.",
  "for_schools.flow_3_body": "Overall review covers the whole solution path, flags which milestones were established, and notes the strongest and weakest steps.",
  "for_schools.flow_4_title": "Teacher sees the dashboard.",
  "for_schools.flow_4_body": "Aggregate view per student, per class. Weekly auto-report lands in the teacher's email Monday morning — ready to read before first period.",
  "for_schools.diff_eyebrow": "Why Arcmath, not the alternatives",
  "for_schools.diff_title": "Compared with the obvious choices.",
  "for_schools.diff_tutors_title": "vs hiring 1:1 tutors",
  "for_schools.diff_tutors_body": "AMC/AIME tutors in tier-1 Chinese cities run ¥400–800/hour. A class of 20 students at 2 hours/week crosses ¥600,000 annually. Arcmath provides unlimited tutor time at a fraction of that cost — and the tutor is consistent.",
  "for_schools.diff_apps_title": "vs answer-key practice apps",
  "for_schools.diff_apps_body": "Most competition apps grade only the final answer. That tells the student where they ended up wrong; not where the reasoning broke. Arcmath grades each step, so feedback hits the actual mistake.",
  "for_schools.diff_chatbots_title": "vs general AI chatbots",
  "for_schools.diff_chatbots_body": "Generic chat models hallucinate proofs. Arcmath's grading is grounded by a real computer algebra system (SymPy) and a Lean kernel check — false positives drop from ~25% (LLM-only) to <2% in our internal evaluations.",
  "for_schools.pilot_eyebrow": "The 2026–2027 free pilot",
  "for_schools.pilot_title": "Five international schools, one academic year, zero cost.",
  "for_schools.pilot_body": "We're opening five pilot slots for international schools to integrate Arcmath into their math enrichment or competition prep program for the 2026–2027 academic year.",
  "for_schools.pilot_get_title": "What you get",
  "for_schools.pilot_get_1": "Full platform access for one academic year (Sept 2026 – Jun 2027), no fee.",
  "for_schools.pilot_get_2": "Unlimited student accounts on the school plan.",
  "for_schools.pilot_get_3": "Full teacher dashboard, classes, assignments, weekly auto reports.",
  "for_schools.pilot_get_4": "Direct line to the founding team for setup and feedback.",
  "for_schools.pilot_get_5": "Your students keep their accounts after the pilot ends.",
  "for_schools.pilot_ask_title": "What we ask",
  "for_schools.pilot_ask_1": "A point-of-contact teacher who'll champion the rollout.",
  "for_schools.pilot_ask_2": "A 15-minute check-in once a month so we can iterate.",
  "for_schools.pilot_ask_3": "Permission to (anonymously) reference your school as a pilot partner.",
  "for_schools.cta_panel_title": "Ready to be one of the five?",
  "for_schools.cta_panel_body": "Reply to the email or use the details below — we'll schedule a 15-min walkthrough this week.",
  "for_schools.contact_wechat": "WeChat",
  "for_schools.contact_email": "Email",
  "for_schools.contact_founder": "Founder",
  "for_schools.contact_founder_name": "Yiming Sun",

  "progress.nav_label": "My progress",
  "progress.eyebrow": "Your progress",
  "progress.title": "Your personalized growth report",
  "progress.empty_lede": "Once you finish your first problem, this page will fill in with a multi-dimensional breakdown — accuracy by topic, time spent, hint reliance, and a study plan written for you.",
  "progress.empty_cta": "Pick a problem to start",
  "progress.hero_lede": "You've been on Arcmath {days} days and worked through {attempts} problems. Here is what the data says about how to push further.",
  "progress.metric_attempts": "Problems attempted",
  "progress.metric_accuracy": "Lifetime accuracy",
  "progress.metric_time": "Total time on task",
  "progress.metric_streak": "Active days last 14",
  "progress.plan_eyebrow": "Your study plan",
  "progress.plan_strength": "Strength",
  "progress.plan_weakness": "Focus area",
  "progress.plan_next_moves": "Next moves",
  "progress.plan_milestone": "4-week milestone",
  "progress.time_eyebrow": "Average time per problem",
  "progress.time_help": "Median across every problem you've submitted.",
  "progress.hint_eyebrow": "Hint reliance",
  "progress.hint_help": "Share of problems where you took at least one hint (avg {avg} hints/problem).",
  "progress.cadence_eyebrow": "Practice cadence",
  "progress.cadence_help": "Days in the last two weeks where you logged in and worked on a problem.",
  "progress.strengths_eyebrow": "Strengths",
  "progress.strengths_empty": "Not enough volume yet — keep going and your strongest topics will surface here.",
  "progress.weaknesses_eyebrow": "Focus areas",
  "progress.weaknesses_empty": "No clear weakness yet — your accuracy is fairly balanced across topics.",
  "progress.attempts_word": "attempts",
  "progress.hints_per_attempt": "{n} hints/attempt",
  "progress.difficulty_eyebrow": "By difficulty",
  "progress.contest_eyebrow": "By contest",
  "progress.col_contest": "Contest",
  "progress.col_attempts": "Attempts",
  "progress.col_accuracy": "Accuracy",
  "progress.footer_hint": "Want to see the report for a single problem set?",
  "progress.footer_link": "View per-set reports →",
  "progress.trend_eyebrow": "Accuracy over time",
  "progress.trend_title": "Your accuracy trend, week by week",
  "progress.trend_y_axis": "Accuracy",
  "progress.trend_empty": "Trend will appear after your second week of practice.",
  "progress.trend_caption": "Each point is your cumulative accuracy on Arcmath, snapshotted at the end of an ISO week. The rightmost point is today.",
  "progress.wow_label": "This week vs last",
  "progress.wow_attempts": "{curr} attempts this week · {prev} last week",
  "progress.topic_bars_eyebrow": "Topic mastery",
  "progress.topic_bars_title": "Accuracy by topic",
  "progress.topic_bars_target": "Vertical line marks the 70% mastery target.",
  "progress.mastery_eyebrow": "Topic mastery levels",
  "progress.mastery_title": "How well you know each topic",
  "progress.mastery_empty": "Mastery levels appear once you've worked on a few problems.",
  "progress.mastery_legend": "Levels 0–5: 0 = not yet practiced, 5 = mastered (≥10 problems at ≥95% accuracy).",
  "progress.mastery_level_0": "Not yet",
  "progress.mastery_level_1": "Just exploring",
  "progress.mastery_level_2": "Learning",
  "progress.mastery_level_3": "Familiar",
  "progress.mastery_level_4": "Proficient",
  "progress.mastery_level_5": "Mastered",
  "progress.mastery_rec_explore": "Explore",
  "progress.mastery_rec_review": "Review",
  "progress.mastery_rec_progress": "Progress",
  "progress.mastery_rec_advance": "Advance",
  "progress.recommend_eyebrow": "Next on your queue",
  "progress.recommend_title": "Problems we picked for you",
  "progress.recommend_empty": "We'll surface picks here once your topic data tells us what to focus on.",
  "progress.recommend_help": "Based on the topics you're currently weakest on. Each card links to the problem set so you can drop straight in.",
  "progress.recommend_open_cta": "Open set",
  "progress.difficulty_easy": "Easy",
  "progress.difficulty_medium": "Medium",
  "progress.difficulty_hard": "Hard",

  "student.solo.eyebrow": "Self-directed practice",
  "student.solo.heading": "You're in solo mode.",
  "student.solo.body": "Your account isn't tied to a school class right now — that's fine. Pick a problem from the library and your progress will track automatically. If your teacher invites you later, classes and assignments will show up here.",
  "student.solo.cta_problems": "Browse problems",
  "student.solo.cta_progress": "See my progress",

  "assignments.badge": "Organization assignments",
  "assignments.subtitle": "Internal assignment board. Students see what to work on; admins post and update.",
  "assignments.back_to_org": "Back to organization",
  "assignments.published_ok": "Assignment published.",
  "assignments.error_title_required": "Title is required.",
  "assignments.error_instructions_required": "Instructions are required.",
  "assignments.error_forbidden": "You don't have permission to manage organization assignments.",
  "assignments.error_invalid_due_date": "Due date is invalid.",
  "assignments.publish_heading": "Publish assignment",
  "assignments.publish_body": "Keep instructions simple and explicit.",
  "assignments.form_title_label": "Title",
  "assignments.form_title_placeholder": "Example: Week 1 Diagnostic Review",
  "assignments.form_instructions_label": "Instructions",
  "assignments.form_instructions_placeholder": "Describe the assignment, expected work, and any submission notes.",
  "assignments.form_due_label": "Due date",
  "assignments.form_submit": "Publish assignment",
  "assignments.current_heading": "Current assignments",
  "assignments.current_help_admin": "Visible to everyone in this organization.",
  "assignments.current_help_student": "Posted by your organization's admins.",
  "assignments.posted_by": "Posted by {author}",
  "assignments.due_label": "Due",
  "assignments.no_due": "No due date",
  "assignments.empty_state": "No organization assignments yet.",

  "legal.eyebrow": "Legal",
  "legal.last_updated": "Last updated: 26 May 2026 (pilot v1). This document is plain-language and will be replaced with a counsel-reviewed version when Arcmath moves out of free pilot.",
  "legal.contact_heading": "Contact",
  "legal.contact_body": "Questions about this document? Reach Yiming Sun at yimingsun@forecaster-ai.com or WeChat 17806162865. We respond within two business days.",
  "legal.terms_title": "Terms of Service",
  "legal.terms_lede": "Plain-language rules of the road for using Arcmath. Read once, then get back to math.",
  "legal.terms_h_who": "Who can use Arcmath",
  "legal.terms_body_who": "Arcmath is a competition-math practice platform. Anyone aged 13 or older may register an individual account. Students under 13 must be onboarded through their school under our school-pilot agreement, and a parent or legal guardian must consent before the student begins practice.",
  "legal.terms_h_accounts": "Your account",
  "legal.terms_body_accounts": "You're responsible for keeping your password private and for any activity under your account. Tell us immediately if you suspect unauthorized access. We may suspend accounts that are shared, automated, or used to circumvent grading.",
  "legal.terms_h_acceptable": "Acceptable use",
  "legal.terms_body_acceptable": "Use Arcmath for genuine practice. Don't: (a) submit other people's work as your own, (b) attempt to break, scrape, or overload the grading engine, (c) upload illegal content, (d) harass other users or staff. Schools may set additional rules for their students inside the platform; please respect them.",
  "legal.terms_h_content": "Your content",
  "legal.terms_body_content": "Math work you submit (LaTeX steps, proofs, free-text answers) stays yours. By submitting, you grant Arcmath a license to store and process it so we can grade, generate reports, and run anonymized aggregate analysis to improve the platform. Schools you belong to may view their own students' submissions; we do not share submissions across schools.",
  "legal.terms_h_ai": "AI feedback",
  "legal.terms_body_ai": "Arcmath's step-by-step feedback is generated by a hybrid system: SymPy / Lean kernel checks plus a large language model judge for ambiguous steps. The system is good but not infallible — feedback should be treated as a study aid, not a final authority. When in doubt, consult the official solution or your teacher.",
  "legal.terms_h_termination": "Termination",
  "legal.terms_body_termination": "You can delete your account from /account at any time. We may suspend or terminate accounts that violate these terms, with notice when possible. After termination, your data is retained for 30 days (so you can restore) and then deleted, except where law requires longer.",
  "legal.terms_h_disclaimer": "Disclaimer",
  "legal.terms_body_disclaimer": "Arcmath is provided \"as is\" during the free pilot. We don't guarantee specific grade outcomes, contest scores, or admissions results. To the extent legally allowed, Arcmath is not liable for indirect or consequential damages arising from use of the platform.",
  "legal.terms_h_changes": "Changes",
  "legal.terms_body_changes": "If we materially change these terms (e.g. when pilot ends), we'll notify registered users by email at least 14 days before the change takes effect.",
  "legal.privacy_title": "Privacy Policy",
  "legal.privacy_lede": "What data we collect about you, where it lives, and how to get it deleted.",
  "legal.privacy_h_collect": "What we collect",
  "legal.privacy_body_collect": "Account info: your name, email, locale, and (for school students) your class and assigned teacher.\nPractice activity: every problem attempt (step text, timestamps, hints used, verdict), your overall reports, and your account-level mastery levels.\nTechnical: IP, browser user-agent, and request logs for the last 30 days (used only for debugging and abuse detection).",
  "legal.privacy_h_use": "How we use it",
  "legal.privacy_body_use": "We use your data to (1) grade your work and generate feedback, (2) build your personal progress report, (3) let your teachers see their own students' progress, (4) run aggregate, anonymized analysis to improve grading accuracy. We do not sell your data and we do not show ads.",
  "legal.privacy_h_storage": "Where it's stored",
  "legal.privacy_body_storage": "Account and practice data live in a managed Postgres database (Neon, US-East region). LLM grading calls go to OpenAI; we do not include your name or email in those calls — only the math content of the step being graded. Daily database backups are stored encrypted for 30 days.",
  "legal.privacy_h_third_party": "Third parties",
  "legal.privacy_body_third_party": "We use these service providers under signed data processing agreements: Neon (database hosting), Resend (transactional email), OpenAI (LLM judge), Fly.io (proof verifier service), Aliyun (web server hosting). They cannot use your data for their own purposes.",
  "legal.privacy_h_retention": "Retention",
  "legal.privacy_body_retention": "Active accounts retain practice data indefinitely so your progress chart works year-over-year. Accounts deleted by user request are erased within 30 days, except technical logs (kept ≤ 90 days for security/audit) and anonymized aggregate stats (no personal identifiers).",
  "legal.privacy_h_rights": "Your rights",
  "legal.privacy_body_rights": "You may at any time: (1) export your data (email us — we'll send a JSON dump within 14 days), (2) correct your name/email via /account, (3) delete your account from /account. School-org members: the school admin may have additional retention rules for compliance reasons; we'll surface those when relevant.",
  "legal.privacy_h_minors": "Students under 13 / 14",
  "legal.privacy_body_minors": "We follow the strictest of: COPPA (US, under 13), GDPR-K (EU, under 16 by member state), and PIPL (China, under 14). For minors in those age bands, school admins must obtain parental consent before adding the student. Parents may request access to or deletion of their child's data by contacting us.",

  "login.kicker": "Welcome Back",
  "login.headline": "Sign in to continue your workflow.",
  "login.subhead": "A cleaner interface makes it easier to move from login to practice, reports, and assignments without losing momentum.",
  "login.stat_student_label": "Student Mode",
  "login.stat_student_body": "Resume practice immediately. Per-step verdicts (SymPy ✓ / Lean ✓ / LLM judge) live alongside every problem.",
  "login.stat_verification_label": "Three-Engine Stack",
  "login.stat_verification_body": "SymPy + Lean + LLM judge. The engine that signed off on each step is shown — no black-box scoring.",
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
  "login.error_unverified": "Please verify your email before signing in. Check your inbox for the verification link we sent.",
  "login.resend_cta": "Resend verification email",
  "login.resend_loading": "Sending...",
  "login.resend_info": "If an account with that email exists and hasn't been verified yet, a new verification link is on its way.",

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

  "register.title": "Start practicing in minutes",
  "register.subtitle": "Create a personal Arcmath account to unlock the full AMC / AIME / Putnam libraries, step-by-step grading, and progress reports. Always free for individual learners during pilot.",
  "register.name_label": "Your name",
  "register.email_label": "Email",
  "register.password_label": "Password",
  "register.password_help": "At least 8 characters.",
  "register.submit": "Create my account",
  "register.submit_loading": "Creating...",
  "register.error_email_in_use": "That email is already registered.",
  "register.error_generic": "Could not create your account. Try again.",
  "register.signin_prefix": "Already have an account?",
  "register.signin_link": "Sign in",
  "register.eyebrow_student": "Students · self-signup",
  "register.success_eyebrow": "Almost there",
  "register.success_title": "Check your email",
  "register.success_body_prefix": "We sent a verification link to",
  "register.success_body_suffix": ". Click it within 24 hours to finish setting up your Arcmath account.",
  "register.success_hint": "Didn't get it? Check your spam folder. The email comes from a noreply@ address — mark it as not-spam so future Arcmath messages land in your inbox.",
  "register.success_cta_login": "I've verified — sign in",
  "register.success_change_email": "Used the wrong email? Go back",
  "register.school_prompt_prefix": "Setting up a class for a school or program?",
  "register.school_prompt_link": "Create a school account",

  "register_school.eyebrow": "Schools · admin signup",
  "register_school.title": "Set up your school on Arcmath",
  "register_school.subtitle": "Create the admin account that owns your school's classes, rosters, and reports. You can invite teachers and roster students after you verify your email.",
  "register_school.org_name_label": "School or program name",
  "register_school.org_name_placeholder": "e.g. North Star Math Academy",
  "register_school.org_name_help": "Shown to your teachers and students inside Arcmath. You can rename it later in school settings.",
  "register_school.name_label": "Your name",
  "register_school.email_label": "Email (admin)",
  "register_school.password_label": "Password",
  "register_school.password_help": "At least 8 characters.",
  "register_school.submit": "Create school account",
  "register_school.submit_loading": "Creating...",
  "register_school.error_generic": "Could not create your school account. Try again.",
  "register_school.success_eyebrow": "Almost there",
  "register_school.success_title": "Check your email",
  "register_school.success_body_prefix": "We sent a verification link to",
  "register_school.success_body_suffix": ". Click it within 24 hours, then sign in to set up your school.",
  "register_school.success_hint": "Once verified, you'll land on your school admin home where you can create classes, roster students, and invite teachers.",
  "register_school.success_cta_login": "I've verified — sign in",
  "register_school.student_prompt_prefix": "Are you a student here on your own?",
  "register_school.student_prompt_link": "Use the personal signup",
  "register_school.signin_prefix": "Already have an account?",
  "register_school.signin_link": "Sign in",

  "verify_email.eyebrow": "Email verification",
  "verify_email.title_success": "You're verified",
  "verify_email.title_expired": "This link has expired",
  "verify_email.title_invalid": "This link isn't valid",
  "verify_email.lede_success": "Your email is now verified. Sign in to start practicing.",
  "verify_email.lede_already_used": "Looks like this verification link was already used. Your email is verified — sign in to continue.",
  "verify_email.lede_expired": "Verification links expire 24 hours after we send them. Sign in below and we'll send you a fresh one.",
  "verify_email.lede_invalid": "We couldn't find that verification token. It may have been mistyped or never existed.",
  "verify_email.lede_missing": "This page expects a verification link from your email. Sign in to request a fresh one.",
  "verify_email.cta_login": "Continue to sign in",
  "verify_email.cta_resend": "Sign in to request a new link",
  "verify_email.help_or": "Or",
  "verify_email.help_signup": "create a new account",

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
  "problemset.open_tutor": "Start",
  "problemset.open_problem": "Start",
  "problemset.total_problems": "{count} problems",
  "problemset.progress_summary": "{attempted}/{total} attempted",
  "problemset.status_submitted": "Submitted",
  "problemset.status_in_progress": "In progress",
  "problemset.cta_review": "Review",
  "problemset.cta_continue": "Continue",
  "problemset.cta_restart": "Start over",
  "problemset.mode_chooser_eyebrow": "Choose your mode",
  "problemset.mode_chooser_title": "How do you want to take this paper?",
  "problemset.mode_chooser_helper": "Pick once. Switching later requires starting the run over from scratch.",
  "problemset.mode_mock_title": "Mock exam",
  "problemset.mode_mock_body": "Simulate the real test. No hint tutor, no step-by-step feedback. Save your answers as you go; we grade everything at the end.",
  "problemset.mode_mock_cta": "Start mock →",
  "problemset.mode_practice_title": "Practice mode",
  "problemset.mode_practice_body": "Full Arcmath workflow. Hint tutor on, step feedback live, and you can ask for nudges per problem.",
  "problemset.mode_practice_cta": "Start practice →",
  "problemset.mode_chooser_error": "Could not start the run. Please try again.",
  "problemset.mode_badge_mock": "Mock",
  "problemset.mode_badge_practice": "Practice",
  "exam.sidebar_heading": "Problems",
  "exam.sidebar_helper": "answered",
  "exam.status_answered": "answered",
  "exam.status_blank": "blank",
  "exam.status_saving": "saving",
  "exam.answer_heading": "Your answer",
  "exam.integer_placeholder": "Type an integer",
  "exam.save": "Save",
  "exam.saved": "Saved",
  "exam.save_error": "Couldn’t save. Try again.",
  "exam.saving": "Saving…",
  "exam.saved_at": "Saved at {time}",
  "exam.prev": "Previous",
  "exam.next": "Next",
  "exam.submit_title": "Submit the whole exam",
  "exam.submit_helper_mock": "Once submitted you can’t change any answer. Blanks count as unanswered.",
  "exam.submit_helper_practice": "Submit when you’re ready. Hints used will be reflected on the report.",
  "exam.submit_cta": "Submit exam",
  "exam.submit_confirm": "Submit the whole exam now? You won’t be able to change answers afterwards.",
  "exam.submitting": "Grading…",
  "exam.choice_diagram_heading": "Choice diagram",
  "exam.hint_title": "Hints",
  "exam.hint_get": "Get a hint",
  "exam.hint_after": "Get the next hint",
  "exam.hint_empty": "No hint available for this problem yet.",
  "exam.hint_error": "Could not load a hint. Try again.",
  "exam.hint_mock_note": "Hints are off in Mock mode.",
  "exam.hint_exhausted": "All hints revealed",
  "problemset.restart_confirm_title": "Start this problem over?",
  "problemset.restart_confirm_body": "All your previous answers, steps, and feedback for this problem will be permanently deleted. This cannot be undone.",
  "problemset.restart_confirm_yes": "Yes, delete and start fresh",
  "problemset.restart_confirm_cancel": "Cancel",
  "problemset.restart_in_progress": "Resetting…",
  "problemset.restart_error": "Could not reset the problem. Please try again.",

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
  "attempt.workspace_subtitle_worked_solution": "Record your long solution in a few sections. We won't judge every line; compare against the official solution when you submit.",
  "attempt.add_step_label": "Add step {n}",
  "attempt.add_step_button": "Add step",
  "attempt.add_step_grading_inline": "Checking this step with your tutor… (~3–5s)",
  "attempt.ocr_trigger": "📷 Scan handwritten step",
  "attempt.ocr_resizing": "Preparing image…",
  "attempt.ocr_calling": "Reading your work…",
  "attempt.ocr_hint":
    "Snap or pick a clear photo of just one step — you'll review the result before saving.",
  "attempt.ocr_error_generic":
    "OCR didn't work. Try typing the step instead, or try a clearer photo.",
  "attempt.ocr_error_too_big":
    "That image is too large. Try a smaller photo (under 10 MB).",
  "attempt.ocr_error_wrong_type":
    "That doesn't look like an image. Upload a JPG, PNG or WebP.",
  "attempt.ocr_retry": "Try again",
  "attempt.ocr_confidence_high": "OCR confidence: high",
  "attempt.ocr_confidence_medium": "OCR confidence: medium — double-check the symbols",
  "attempt.ocr_confidence_low":
    "OCR confidence: low — please verify carefully before saving",
  "attempt.ocr_confidence_none":
    "OCR couldn't read this clearly. Try a sharper photo or type the step.",
  "attempt.ocr_unavailable":
    "Photo OCR is not available right now. Please type the step instead.",
  "attempt.ocr_review_prompt":
    "Edit the recognized step below before you save it.",
  "attempt.ocr_multi_step_trigger": "📷 Scan step photos",
  "attempt.ocr_multi_step_hint":
    "Select one or several clear photos. We'll split them into steps and let you review each one before saving.",
  "attempt.ocr_quota_exceeded":
    "Daily OCR limit reached ({used}/{limit}). Try again tomorrow, or type the remaining steps.",
  "attempt.next_step_hint_button": "Hint for next step",
  "attempt.next_step_hint_pending": "Asking your tutor…",
  "attempt.next_step_hint_label": "Tutor suggestion",
  "attempt.next_step_hint_help": "Get a quick nudge about what to try next based on the work you've shown so far.",
  "attempt.next_step_hint_dismiss": "Dismiss hint",
  "attempt.error_failed_next_step_hint": "Couldn't fetch a hint right now — try again in a moment.",
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
  "attempt.continue_or_restart_label": "You've worked on this problem before",
  "attempt.continue_or_restart_body": "Pick up where you left off, or wipe the slate and try again from scratch.",
  "attempt.continue_or_restart_modal_title": "Continue or restart this problem?",
  "attempt.continue_view_submission": "Continue · review my submission",
  "attempt.continue_or_restart_restart": "Restart from scratch",
  "attempt.continue_or_restart_confirm": "This will clear your previous attempt for this problem (steps, hints, and feedback) and start a fresh one. Continue?",
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
  "attempt.solution_section_n_label": "Solution section {n}",
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
  "attempt.submit_row_worked_solution": "Done writing? We'll record your solution sections so you can compare with the official solution.",
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
  "attempt.review_ungraded_short": "Recorded — not auto-graded",
  "attempt.review_ungraded_hint": "Long-form competition problems (Putnam, USAMO, STEP, MAT) are graded on the proof, not the final answer alone. Compare your work against the official solution below.",
  "attempt.reveal_official_solution_for_long_question": "Reveal official solution",
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

  "org.students.eyebrow": "Teacher view",
  "org.students.title": "Students in your organization",
  "org.students.subtitle":
    "{n} active student{n, plural, one {} other {s}}. Click any row to see their lifetime progress.",
  "org.students.back_to_org": "Back to organization",
  "org.students.empty":
    "No students have joined this organization yet. Invite them from the organization dashboard.",
  "org.students.col_name": "Student",
  "org.students.col_attempts": "Attempts",
  "org.students.col_accuracy": "Accuracy",
  "org.students.col_last_active": "Last active",
  "org.students.row_view": "View",
  "org.students.last_active_never": "—",
  "org.students.last_active_today": "Today",
  "org.students.last_active_yesterday": "Yesterday",
  "org.students.last_active_days_ago": "{n} days ago",
  "org.students.filter_class_label": "Class",
  "org.students.filter_all_classes": "All classes",
  "org.students.export_csv": "Export CSV",
  "org.students.csv_col_correct": "Correct",
  "org.students.csv_col_joined": "Joined",
  "org.students.csv_col_classes": "Classes",
  "org.students.parent_invite_heading": "Invite parent or guardian",
  "org.students.parent_invite_helper": "They'll get an email with a private link to view this student's lifetime progress. Valid for 30 days, no account needed.",
  "org.students.parent_invite_email_label": "Parent email",
  "org.students.parent_invite_email_placeholder": "parent@example.com",
  "org.students.parent_invite_relationship_label": "Relationship (optional)",
  "org.students.parent_invite_relationship_placeholder": "Mom / Dad / Guardian",
  "org.students.parent_invite_submit": "Send invite",
  "org.students.parent_invite_submitting": "Sending…",
  "org.students.parent_invite_success": "Invite sent. Link expires",
  "org.students.parent_invite_err_invalid_email": "Please enter a valid email address.",
  "org.students.parent_invite_err_generic": "Something went wrong. Please try again.",
  "org.students.lifetime_eyebrow": "Lifetime progress",
  "org.students.lifetime_attempts": "Attempts",
  "org.students.lifetime_accuracy": "Accuracy",
  "org.students.lifetime_active_days": "Active days (14d)",
  "org.students.lifetime_hint_reliance": "Hint reliance",
  "org.students.strengths_heading": "Top strengths",
  "org.students.strengths_empty": "Not enough data yet to identify strengths.",
  "org.students.weaknesses_heading": "Reinforcement targets",
  "org.students.weaknesses_empty": "Not enough data yet to spot weak topics.",
  "org.students.mastery_eyebrow": "Topic mastery (0–5)",
  "org.students.mastery_title":
    "Per-topic mastery — matches what the student sees on their own progress page",

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
  "problems.placement.heading": "Find your level — free placement tests",
  "problems.placement.subtitle": "Three difficulty tiers per contest. Pick a level that matches where you are; each test is real AMC problems curated by difficulty so the result actually tells you where to start practicing.",
  "problems.placement.tier_foundation": "Foundation",
  "problems.placement.tier_intermediate": "Intermediate",
  "problems.placement.tier_advanced": "Advanced",
  "problems.placement.level_i_desc": "Easy entry-level problems, similar to AMC questions #1–10. Start here if you're new to competition math.",
  "problems.placement.level_ii_desc": "Medium-difficulty, similar to AMC questions #11–20. Start here if early-paper problems feel comfortable.",
  "problems.placement.level_iii_desc": "Hard contest-level problems, similar to AMC questions #21–25. Start here if you can already finish the easy half consistently.",
  "problems.placement.contest_amc8": "AMC 8",
  "problems.placement.contest_amc10": "AMC 10",
  "problems.placement.contest_amc12": "AMC 12",
  "problems.placement.contest_subtitle": "Three placement tests",
  "problems.placement.problems_word": "problems",
  "problems.amc.heading": "AMC competitions",
  "problems.amc.subtitle": "AMC 8, 10, and 12 past papers and topic-focused practice sets. Drawn directly from the official released contests.",
  "problems.other.heading": "Other competitions",
  "problems.other.subtitle": "AIME, USAMO/USAJMO, Putnam, Euclid, MAT, STEP, and more. Browse by contest and year.",
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

  "home.hero.kicker": "Formal Verification × Competition Math",
  "home.hero.headline": "Math competition practice, formally verified.",
  "home.hero.subhead": "Every step a student writes is checked by SymPy or Lean — not by an LLM guessing. Real contest problems, three-engine verification, no hallucinated grades.",
  "home.hero.pill_practice": "SymPy + Lean kernel",
  "home.hero.pill_progress": "Per-step verdict trace",
  "home.hero.pill_aesthetic": "AMC · AIME · Putnam · Euclid · MAT · STEP · USAMO",
  "home.hero.cta_dashboard": "Open Dashboard",
  "home.hero.cta_browse_problems": "Browse Problems",
  "home.hero.cta_create_account": "Create Account",
  "home.hero.cta_sign_in": "Sign In",
  "home.hero.cta_student": "Students · Start free",
  "home.hero.cta_school": "I'm a teacher · Set up school",
  "home.hero.student_label": "For learners",
  "home.hero.student_tagline": "Unlock the full AMC 8 / 10 / 12, AIME, and Putnam libraries. Every step is graded with SymPy + Lean — no LLM hallucinations.",
  "home.hero.school_label": "For schools",
  "home.hero.school_tagline": "Roster students in minutes, assign problem sets, and grade multi-step proofs automatically. Per-student progress reports included.",
  "home.hero.signin_prompt": "Already have an account?",
  "home.hero.signin_link": "Sign in",
  "home.stats.practice_label": "Library",
  "home.stats.practice_value": "Full canon",
  "home.stats.practice_desc": "AMC 8 / 10 / 12, AIME, USAMO, Putnam, Euclid, MAT, STEP II — every set with author-reviewed manifests, growing each contest cycle.",
  "home.stats.verification_label": "Verification",
  "home.stats.verification_value": "3 engines",
  "home.stats.verification_desc": "SymPy checks algebraic identities, Lean kernel handles formal logic, an LLM judge fills the gap. Each step shows which engine signed off.",
  "home.stats.library_label": "Hints",
  "home.stats.library_value": "Pre-computed",
  "home.stats.library_desc": "Three progressive hints baked into every problem. Even when the LLM is unavailable, students get a problem-specific nudge — never a generic placeholder.",
  "home.cards.eyebrow": "Verification stack",
  "home.cards.headline": "Three engines, one verdict",
  "home.cards.lede": "Every step a student writes is checked by deterministic math first. We only escalate to an LLM judge — or to the teacher — when the symbolic backends are unsure.",
  "home.demo.ocr_eyebrow": "01 / Photo OCR",
  "home.demo.ocr_title": "Snap a photo, get LaTeX. Edit, submit.",
  "home.demo.grading_eyebrow": "02 / Grading",
  "home.demo.grading_title": "Watch one step get verified, live.",
  "home.demo.hint_eyebrow": "03 / Hints",
  "home.demo.hint_title": "Progressive nudges — direction first, answer last.",
  "home.demo.report_eyebrow": "04 / Report",
  "home.demo.report_title": "A clear picture after every session.",
  "home.hero.florid_word": "verifiable",
  "home.cards.sympy_title": "01 / SymPy",
  "home.cards.sympy_body": "Algebraic identities, equation manipulation, simple inequalities. Student writes 2x = 4 → SymPy returns VERIFIED in milliseconds. No LLM round-trip.",
  "home.cards.lean_title": "02 / Lean kernel",
  "home.cards.lean_body": "Proof-level steps run through Lean's kernel. Geometry, number theory, induction — when a step type-checks, it really is correct. The LLM cannot bullshit the kernel.",
  "home.cards.llm_title": "03 / LLM judge",
  "home.cards.llm_body": "For everything Lean and SymPy don't cover yet (combinatorial arguments, geometric reasoning), an LLM judge gives a verdict — clearly tagged so the student knows which engine signed off.",
  "home.helps.kicker": "Why Lean over plain LLM",
  "home.helps.headline": "An LLM that grades math is just guessing. A kernel does not guess.",
  "home.helps.subhead": "ChatGPT will tell a student their wrong proof is correct because it sounds plausible. Our kernel rejects it. That is the entire wedge.",
  "home.helps.assignments_title": "Per-step verdicts",
  "home.helps.assignments_body": "Each step gets VERIFIED / PLAUSIBLE / INVALID — and which engine produced the verdict. No black-box scores.",
  "home.helps.resources_title": "Real contest catalog",
  "home.helps.resources_body": "AMC, AIME, Putnam, Euclid, MAT, STEP, USAMO — hand-authored manifests with verified statements and official solution sketches.",
  "home.helps.guided_title": "3-tier hints",
  "home.helps.guided_body": "Pre-computed at indexing time. Hint 1 nudges direction, hint 2 sets up structure, hint 3 sketches the path — but never reveals the answer.",
  "home.helps.reports_title": "Teacher visibility",
  "home.helps.reports_body": "Teachers see exactly which engine verified which step, which hints a student used, and where the proof broke. Not a vibes-based progress bar.",
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
  "topnav.tagline": "形式化验证的数学竞赛训练",
  "topnav.dashboard": "我的主页",
  "topnav.organization": "学校",
  "topnav.assignments": "作业",
  "topnav.resources": "资源",
  "topnav.reports": "报告",
  "topnav.membership": "会员",
  "topnav.my_work": "我的学习",
  "topnav.register": "注册",
  "topnav.account": "账号",

  "account.eyebrow": "设置",
  "account.title": "账号设置",
  "account.subtitle": "调整 Arcmath 的界面与体验。更多选项陆续上线。",
  "account.email_label": "邮箱",
  "account.name_label": "姓名",
  "account.language_label": "界面语言",
  "account.language_heading": "界面语言",
  "account.language_help": "影响导航、按钮、页面标题等界面文本的语言。题目原文和导师批注的语言在下方单独设置。",
  "account.ui_language_heading": "界面语言",
  "account.ui_language_help": "影响导航、按钮、页面标题等界面文本的语言。题目原文和导师批注的语言在下方单独设置。",
  "account.feedback_language_label": "批注语言",
  "account.feedback_language_heading": "导师批注 & 提示",
  "account.feedback_language_help": "AI 导师在分步批改、提示和最终点评中使用的语言。默认英文，因为比赛真题本身就是英文出题；如果你更习惯读中文讲解，可切换为中文。",

  "for_schools.eyebrow": "为国际学校而设",
  "for_schools.hero_title": "以 AI 逐步批改，贴近学生真实做题过程的竞赛数学平台。",
  "for_schools.hero_lede": "Arcmath 让学校能为每个学生在每一步推导上提供逐步反馈——不会把教师团队累垮。2026–2027 学年免费内测已面向 5 所学校开放。",
  "for_schools.cta_email": "邮件联系内测",
  "for_schools.cta_register_school": "创建学校账号",
  "for_schools.pilot_badge": "5 个免费名额——整学年完整功能，学生账号永久保留。",
  "for_schools.why_eyebrow": "为什么这件事值得做",
  "for_schools.why_title": "好成绩需要的教师时间，老师其实给不出来。",
  "for_schools.why_body_1": "国际学校的数学项目越来越倚重 AMC、AIME、奥数等真题成绩——这是合理的，因为这些含金量高的标签是顶尖大学申请的敲门砖。但真正卡住学生的，往往不是天赋，而是教师时间。",
  "for_schools.why_body_2": "一道证明题的推导思路、一处差一个符号的失误——只有这种逐步批改才能把学生从 AMC10 的 80 分推到 130 分。然而一位老师面对三十名学生，不可能每周三次逐行读完三十份证明。",
  "for_schools.why_callout_label": "今天行业的真实师生比",
  "for_schools.why_callout_body": "1 位竞赛教练 ：30 名学生 ≈ 每周每个学生 6 分钟批改时间。Arcmath 让每个学生的每一步都能得到逐步反馈，不需要教师在场。",
  "for_schools.pillars_eyebrow": "Arcmath 是什么",
  "for_schools.pillars_title": "三个模块协同工作。",
  "for_schools.pillar_1_title": "AI 分步批改",
  "for_schools.pillar_1_body": "学生在数学公式编辑器里逐步输入推导。批改引擎（SymPy + Lean + 大模型 judge）读懂每一步，给出 已验证 / 待复核 / 错误 三档结论，并配一句中文（或英文）导师批注。",
  "for_schools.pillar_2_title": "真题库",
  "for_schools.pillar_2_body": "AMC 8/10/12、AIME、Putnam、USAMO、Euclid、MAT、STEP——全部源自官方档案，LaTeX 排版，按知识点和难度打标。每个考试都有多年份，学生可以从头到尾刷一整套真题卷。",
  "for_schools.pillar_3_title": "教师端 + 自动报告",
  "for_schools.pillar_3_body": "每位学生的错题模式按知识点、难度、提示使用频率分类呈现。系统每周自动生成学习报告——就像家长会上您本想说的那些话，由系统替您写好。",
  "for_schools.flow_eyebrow": "一次做题的流程",
  "for_schools.flow_title": "从打开一道题到拿到报告——全程四步。",
  "for_schools.flow_1_title": "选一道题。",
  "for_schools.flow_1_body": "学生从题库里打开 AMC10 2022 第 18 题（或者任何一份真题卷里的题目）。",
  "for_schools.flow_2_title": "写一步。立刻看到反馈。",
  "for_schools.flow_2_body": "学生每写一步，系统就跑一次批改。约 3 秒内显示判定结果和一句导师批注。卡住？点击“下一步提示”拿到一句指向性的提醒。",
  "for_schools.flow_3_title": "提交答案。",
  "for_schools.flow_3_body": "整体批改贯穿全部步骤，标出关键里程碑覆盖情况，指出最稳和最弱的步骤。",
  "for_schools.flow_4_title": "教师查看仪表板。",
  "for_schools.flow_4_body": "按学生、按班级聚合查看。每周一早上系统把自动周报发到教师邮箱——上第一节课前就能读完。",
  "for_schools.diff_eyebrow": "为什么选 Arcmath，而不是其他方案",
  "for_schools.diff_title": "与几种常见替代方案的对比。",
  "for_schools.diff_tutors_title": "相比 1:1 家教",
  "for_schools.diff_tutors_body": "一线城市能带 AMC/AIME 的家教时薪 ¥400–800。一个 20 人班每周两小时，全年开销超过 ¥60 万。Arcmath 用一小部分预算就能给每个学生几乎无限的导师时间——而且这位导师稳定，不会离职。",
  "for_schools.diff_apps_title": "相比只对答案的刷题 App",
  "for_schools.diff_apps_body": "大多数刷题 App 只判最终答案。学生只知道结果错了，不知道推理在哪一步偏了。Arcmath 逐步批改，反馈直接指向真正的错误。",
  "for_schools.diff_chatbots_title": "相比通用 AI 聊天工具",
  "for_schools.diff_chatbots_body": "通用大模型会把证明编出来。Arcmath 的批改底座是真正的计算代数系统（SymPy）+ Lean 内核验证——内部评测中的误判率从 LLM 单独使用的 25% 降到 2% 以下。",
  "for_schools.pilot_eyebrow": "2026–2027 学年免费内测",
  "for_schools.pilot_title": "五所国际学校，整学年，零费用。",
  "for_schools.pilot_body": "我们面向国际学校开放 5 个内测名额，在 2026–2027 学年把 Arcmath 接入贵校的数学竞赛或拔尖培养项目。",
  "for_schools.pilot_get_title": "您将获得",
  "for_schools.pilot_get_1": "整个学年（2026 年 9 月 – 2027 年 6 月）完整平台权限，免费。",
  "for_schools.pilot_get_2": "学校套餐下不限学生账号数。",
  "for_schools.pilot_get_3": "完整教师端：班级、作业、自动周报。",
  "for_schools.pilot_get_4": "直接对接创始团队，部署 + 反馈无中间环节。",
  "for_schools.pilot_get_5": "内测结束后，学生账号永久保留。",
  "for_schools.pilot_ask_title": "我们希望您能",
  "for_schools.pilot_ask_1": "指派一位牵头教师推动落地。",
  "for_schools.pilot_ask_2": "每月一次 15 分钟反馈通话，便于我们持续优化。",
  "for_schools.pilot_ask_3": "允许我们（匿名）将贵校作为内测合作方简短引用。",
  "for_schools.cta_panel_title": "想成为这五所中的一所？",
  "for_schools.cta_panel_body": "请回复邮件，或通过下方联系方式与我们联系——本周内安排 15 分钟演示。",
  "for_schools.contact_wechat": "微信",
  "for_schools.contact_email": "邮箱",
  "for_schools.contact_founder": "创始人",
  "for_schools.contact_founder_name": "孙翼鸣",

  "progress.nav_label": "我的成长报告",
  "progress.eyebrow": "你的成长",
  "progress.title": "你的个性化成长报告",
  "progress.empty_lede": "做完第一道题之后，这里会显示一份多维度分析——按知识点的正确率、用时、提示依赖度，外加一份为你量身写的学习方案。",
  "progress.empty_cta": "去做第一道题",
  "progress.hero_lede": "你在 Arcmath 上已经有 {days} 天，刷了 {attempts} 道题。下面是数据告诉我们：你下一步应该怎么往前推。",
  "progress.metric_attempts": "总做题数",
  "progress.metric_accuracy": "终身正确率",
  "progress.metric_time": "总耗时",
  "progress.metric_streak": "近 14 天活跃天数",
  "progress.plan_eyebrow": "你的学习方案",
  "progress.plan_strength": "强项",
  "progress.plan_weakness": "需要补的方向",
  "progress.plan_next_moves": "下一步动作",
  "progress.plan_milestone": "4 周里程碑",
  "progress.time_eyebrow": "每道题平均用时",
  "progress.time_help": "基于你提交过的所有题。",
  "progress.hint_eyebrow": "提示依赖度",
  "progress.hint_help": "用了至少一次提示的题占比（平均 {avg} 次提示/题）。",
  "progress.cadence_eyebrow": "练习节奏",
  "progress.cadence_help": "近两周中有几天登录并做题。",
  "progress.strengths_eyebrow": "你的强项",
  "progress.strengths_empty": "样本还不够多——再多刷几道，强项会浮出来。",
  "progress.weaknesses_eyebrow": "重点补的方向",
  "progress.weaknesses_empty": "暂时没有明显薄弱点——你的正确率分布比较均衡。",
  "progress.attempts_word": "次",
  "progress.hints_per_attempt": "每题用 {n} 次提示",
  "progress.difficulty_eyebrow": "按难度",
  "progress.contest_eyebrow": "按考试",
  "progress.col_contest": "考试",
  "progress.col_attempts": "做题数",
  "progress.col_accuracy": "正确率",
  "progress.footer_hint": "想看某一套题的单独报告？",
  "progress.footer_link": "查看单次报告 →",
  "progress.trend_eyebrow": "正确率随时间变化",
  "progress.trend_title": "你的每周正确率曲线",
  "progress.trend_y_axis": "正确率",
  "progress.trend_empty": "刷题进入第二周后，这里会显示趋势曲线。",
  "progress.trend_caption": "每个数据点是你在 Arcmath 累计正确率，按 ISO 周末快照。最右侧的点是今天。",
  "progress.wow_label": "本周 vs 上周",
  "progress.wow_attempts": "本周做 {curr} 道 · 上周 {prev} 道",
  "progress.topic_bars_eyebrow": "知识点掌握度",
  "progress.topic_bars_title": "按知识点的正确率",
  "progress.topic_bars_target": "竖线标记 70% 的掌握目标线。",
  "progress.mastery_eyebrow": "知识点掌握等级",
  "progress.mastery_title": "你每个知识点的掌握程度",
  "progress.mastery_empty": "再刷几道题，这里会显示各知识点的掌握等级。",
  "progress.mastery_legend": "等级 0–5：0 = 还没练过，5 = 完全掌握（≥10 道题、正确率 ≥95%）。",
  "progress.mastery_level_0": "未开始",
  "progress.mastery_level_1": "刚接触",
  "progress.mastery_level_2": "学习中",
  "progress.mastery_level_3": "熟悉",
  "progress.mastery_level_4": "熟练",
  "progress.mastery_level_5": "已掌握",
  "progress.mastery_rec_explore": "多刷",
  "progress.mastery_rec_review": "复习",
  "progress.mastery_rec_progress": "进阶",
  "progress.mastery_rec_advance": "前进",
  "progress.recommend_eyebrow": "为你挑选的下一题",
  "progress.recommend_title": "我们替你挑的题",
  "progress.recommend_empty": "数据足够之后，这里会出现针对性的推题。",
  "progress.recommend_help": "基于你目前最弱的几个知识点挑选，每张卡片直接跳到对应题集，点开就能做。",
  "progress.recommend_open_cta": "进入题集",
  "progress.difficulty_easy": "简单",
  "progress.difficulty_medium": "中等",
  "progress.difficulty_hard": "困难",

  "student.solo.eyebrow": "自学模式",
  "student.solo.heading": "你目前是自学模式。",
  "student.solo.body": "你的账号现在没加入任何学校班级——没关系。直接从题库挑题就行，进度会自动追踪。后面老师邀请你之后，班级和作业会出现在这里。",
  "student.solo.cta_problems": "去刷题",
  "student.solo.cta_progress": "查看我的进度",

  "assignments.badge": "组织作业",
  "assignments.subtitle": "组织内部的作业板。学生看到要做的，管理员发布或更新。",
  "assignments.back_to_org": "返回组织主页",
  "assignments.published_ok": "作业已发布。",
  "assignments.error_title_required": "标题必填。",
  "assignments.error_instructions_required": "作业说明必填。",
  "assignments.error_forbidden": "你没有管理组织作业的权限。",
  "assignments.error_invalid_due_date": "截止时间格式错误。",
  "assignments.publish_heading": "发布作业",
  "assignments.publish_body": "说明写简单明确即可。",
  "assignments.form_title_label": "标题",
  "assignments.form_title_placeholder": "例如：第 1 周诊断题复盘",
  "assignments.form_instructions_label": "作业说明",
  "assignments.form_instructions_placeholder": "描述作业内容、期望完成的工作、以及任何提交说明。",
  "assignments.form_due_label": "截止时间",
  "assignments.form_submit": "发布作业",
  "assignments.current_heading": "当前作业",
  "assignments.current_help_admin": "组织所有成员都能看到。",
  "assignments.current_help_student": "由你的组织管理员发布。",
  "assignments.posted_by": "由 {author} 发布",
  "assignments.due_label": "截止",
  "assignments.no_due": "无截止时间",
  "assignments.empty_state": "暂无组织作业。",

  "legal.eyebrow": "法律声明",
  "legal.last_updated": "最近更新：2026 年 5 月 26 日（pilot v1）。本文档为简明白话版，Arcmath 退出免费内测期后会替换为律师审定版。",
  "legal.contact_heading": "联系",
  "legal.contact_body": "对本文档有疑问？联系孙翼鸣，邮箱 yimingsun@forecaster-ai.com 或微信 17806162865，我们 2 个工作日内回复。",
  "legal.terms_title": "使用条款",
  "legal.terms_lede": "白话版的使用规则。读一遍，剩下时间专心做数学。",
  "legal.terms_h_who": "谁可以使用 Arcmath",
  "legal.terms_body_who": "Arcmath 是竞赛数学练习平台。年满 13 周岁可自行注册个人账号。未满 13 周岁的学生须由学校在我们的内测协议下接入，并由家长/法定监护人在学生开始练习前给予同意。",
  "legal.terms_h_accounts": "你的账号",
  "legal.terms_body_accounts": "请妥善保管密码，账号下的所有活动由你负责。如怀疑账号被盗，请立即通知我们。共享账号、使用自动化脚本、绕过批改的行为可能被封号。",
  "legal.terms_h_acceptable": "可接受使用范围",
  "legal.terms_body_acceptable": "请用于真实练习。禁止：(a) 把他人作品当成自己的提交；(b) 试图破坏、抓取或过载批改引擎；(c) 上传违法内容；(d) 骚扰其他用户或工作人员。所在学校可在平台内为学生设额外规则，请尊重。",
  "legal.terms_h_content": "你的内容",
  "legal.terms_body_content": "你提交的数学内容（LaTeX 步骤、证明、自由作答）所有权归你。提交即授权 Arcmath 存储和处理，用于批改、生成报告、做匿名化的整体分析以改进平台。你所在的学校可查看自己学生的提交；我们不会在学校之间共享。",
  "legal.terms_h_ai": "AI 反馈",
  "legal.terms_body_ai": "Arcmath 的分步反馈由混合系统生成：SymPy / Lean 内核检查 + 大模型 judge 处理含糊步骤。系统较准但非完美——反馈应被视为学习辅助，不是最终权威。有疑问请参考官方答案或老师。",
  "legal.terms_h_termination": "终止",
  "legal.terms_body_termination": "你可随时在 /account 删除账号。我们也可能因违反条款暂停或终止账号，必要时给出提前通知。终止后数据保留 30 天（便于恢复），之后删除，除非法律要求更长。",
  "legal.terms_h_disclaimer": "免责声明",
  "legal.terms_body_disclaimer": "免费内测期间 Arcmath 按现状提供，不保证具体成绩、竞赛名次或申请结果。法律允许范围内 Arcmath 不对使用平台产生的间接或衍生损失负责。",
  "legal.terms_h_changes": "条款变更",
  "legal.terms_body_changes": "如发生实质性变更（如内测结束转付费），至少提前 14 天用邮箱通知已注册用户。",
  "legal.privacy_title": "隐私政策",
  "legal.privacy_lede": "我们收集你哪些数据、存在哪里、怎么删除。",
  "legal.privacy_h_collect": "收集哪些数据",
  "legal.privacy_body_collect": "账号信息：姓名、邮箱、语言偏好；学校学生还包含班级和带教老师。\n练习活动：每次做题（步骤文本、时间戳、提示用量、判定结果）、整体报告、知识点掌握等级。\n技术性：IP、浏览器 user-agent、近 30 天的请求日志（仅用于排错和反滥用）。",
  "legal.privacy_h_use": "如何使用",
  "legal.privacy_body_use": "(1) 批改你的作答并生成反馈；(2) 构建你的个人成长报告；(3) 让你的老师查看自己学生的进度；(4) 做匿名化整体分析改进批改准确率。我们不出售你的数据，也不投广告。",
  "legal.privacy_h_storage": "存在哪里",
  "legal.privacy_body_storage": "账号和练习数据存在托管 Postgres（Neon，US-East 区）。大模型批改调用走 OpenAI；我们不会在调用中带姓名/邮箱——只带要被批改的题目文本。每日数据库备份加密保存 30 天。",
  "legal.privacy_h_third_party": "第三方",
  "legal.privacy_body_third_party": "我们通过签署 DPA 与以下服务商合作：Neon（数据库）、Resend（事务邮件）、OpenAI（大模型 judge）、Fly.io（formal verifier 服务）、阿里云（Web 服务器）。他们不能将你的数据用于自身用途。",
  "legal.privacy_h_retention": "数据保留",
  "legal.privacy_body_retention": "活跃账号长期保留练习数据，让历年成长曲线可看。用户主动删号后 30 天内擦除，但技术日志（最多 90 天，用于安全审计）和匿名化整体统计（无个人标识）除外。",
  "legal.privacy_h_rights": "你的权利",
  "legal.privacy_body_rights": "你随时可：(1) 导出数据（发邮件给我们，14 天内提供 JSON）；(2) 在 /account 修改姓名/邮箱；(3) 在 /account 删除账号。学校学生：学校管理员可能因合规需要设额外保留规则，必要时我们会告知。",
  "legal.privacy_h_minors": "未成年学生（13/14 岁以下）",
  "legal.privacy_body_minors": "我们采取以下三者中最严的：COPPA（美，13 岁以下）、GDPR-K（欧，各成员国 16 岁以下）、PIPL（中，14 岁以下）。该年龄段的学生须由学校管理员在加入前获得家长同意。家长可通过联系我们查阅或删除孩子的数据。",

  "login.kicker": "欢迎回来",
  "login.headline": "登录后继续学习。",
  "login.subhead": "清爽的界面让你从登录到练习、报告、作业一气呵成。",
  "login.stat_student_label": "学生模式",
  "login.stat_student_body": "立刻回到题目。每道题旁都标出每一步是 SymPy / Lean / LLM 哪一个引擎签的。",
  "login.stat_verification_label": "三引擎验证栈",
  "login.stat_verification_body": "SymPy + Lean + LLM judge。每一步签名透明可查，没有黑盒打分。",
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
  "login.error_unverified": "请先验证你的邮箱再登录。注册时我们已发送验证链接，请到邮箱里点击。",
  "login.resend_cta": "重新发送验证邮件",
  "login.resend_loading": "发送中…",
  "login.resend_info": "如果该邮箱对应的账号存在且未验证，新的验证链接将很快送达。",

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

  "register.title": "几分钟后开始刷题",
  "register.subtitle": "注册一个 Arcmath 个人账号，解锁 AMC、AIME、Putnam 全套题库，享受逐步批改和个人学习报告。Pilot 阶段对个人用户永久免费。",
  "register.name_label": "你的姓名",
  "register.email_label": "邮箱",
  "register.password_label": "密码",
  "register.password_help": "至少 8 个字符。",
  "register.submit": "创建我的账号",
  "register.submit_loading": "创建中...",
  "register.error_email_in_use": "该邮箱已注册。",
  "register.error_generic": "创建失败，请重试。",
  "register.signin_prefix": "已有账号？",
  "register.signin_link": "登录",
  "register.eyebrow_student": "学生 · 自助注册",
  "register.success_eyebrow": "马上就好",
  "register.success_title": "请查收邮件",
  "register.success_body_prefix": "我们刚刚把验证链接发到了",
  "register.success_body_suffix": "。请在 24 小时内点击链接完成注册。",
  "register.success_hint": "没收到？检查一下垃圾邮件。邮件来自 noreply@ 地址——记得标记为非垃圾邮件，以后 Arcmath 的消息才会进收件箱。",
  "register.success_cta_login": "已验证 · 去登录",
  "register.success_change_email": "邮箱填错了？返回修改",
  "register.school_prompt_prefix": "要给学校或培训机构开账号？",
  "register.school_prompt_link": "创建学校账号",

  "register_school.eyebrow": "学校 · 管理员注册",
  "register_school.title": "在 Arcmath 上开通你的学校",
  "register_school.subtitle": "创建管理员账号，掌握全校的班级、学生名册和报告。验证邮箱后可以邀请老师、添加学生。",
  "register_school.org_name_label": "学校或机构名称",
  "register_school.org_name_placeholder": "例如：北辰数学学院",
  "register_school.org_name_help": "全校老师和学生在 Arcmath 内会看到这个名字，后续可在学校设置里修改。",
  "register_school.name_label": "你的姓名",
  "register_school.email_label": "邮箱（管理员）",
  "register_school.password_label": "密码",
  "register_school.password_help": "至少 8 位。",
  "register_school.submit": "创建学校账号",
  "register_school.submit_loading": "创建中…",
  "register_school.error_generic": "创建失败，请重试。",
  "register_school.success_eyebrow": "马上就好",
  "register_school.success_title": "请查收邮件",
  "register_school.success_body_prefix": "我们刚刚把验证链接发到了",
  "register_school.success_body_suffix": "。24 小时内点击链接，然后登录即可开始配置学校。",
  "register_school.success_hint": "验证后会自动进入学校管理员主页，你可以在那里创建班级、导入学生、邀请老师。",
  "register_school.success_cta_login": "已验证 · 去登录",
  "register_school.student_prompt_prefix": "你是个人用户来体验？",
  "register_school.student_prompt_link": "用学生入口注册",
  "register_school.signin_prefix": "已有账号？",
  "register_school.signin_link": "登录",

  "verify_email.eyebrow": "邮箱验证",
  "verify_email.title_success": "验证成功",
  "verify_email.title_expired": "链接已过期",
  "verify_email.title_invalid": "链接无效",
  "verify_email.lede_success": "邮箱验证完成。登录即可开始刷题。",
  "verify_email.lede_already_used": "这个链接已经被使用过了——你的邮箱已验证，请直接登录。",
  "verify_email.lede_expired": "验证链接 24 小时后失效。先登录，我们会重新发一份。",
  "verify_email.lede_invalid": "找不到这个验证 token——可能输错了或本来就不存在。",
  "verify_email.lede_missing": "这个页面需要从邮件里点过来的验证链接。先登录，我们会重新发一份。",
  "verify_email.cta_login": "继续登录",
  "verify_email.cta_resend": "登录并重新发送",
  "verify_email.help_or": "或者",
  "verify_email.help_signup": "重新注册一个",

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
  "problemset.open_tutor": "开始",
  "problemset.open_problem": "开始",
  "problemset.total_problems": "共 {count} 题",
  "problemset.progress_summary": "已做 {attempted}/{total}",
  "problemset.status_submitted": "已提交",
  "problemset.status_in_progress": "进行中",
  "problemset.cta_review": "查看",
  "problemset.cta_continue": "继续",
  "problemset.cta_restart": "重新开始",
  "problemset.mode_chooser_eyebrow": "选择模式",
  "problemset.mode_chooser_title": "怎么作答这套真题？",
  "problemset.mode_chooser_helper": "一次性选定。中途想换模式需要重新开始整套。",
  "problemset.mode_mock_title": "模考模式",
  "problemset.mode_mock_body": "完全模拟考场。无提示导师，无步骤反馈。每题保存草稿，全部做完一起批改。",
  "problemset.mode_mock_cta": "开始模考 →",
  "problemset.mode_practice_title": "练习模式",
  "problemset.mode_practice_body": "Arcmath 完整训练流程。提示导师、步骤实时反馈、可逐题求助。",
  "problemset.mode_practice_cta": "开始练习 →",
  "problemset.mode_chooser_error": "启动失败，请重试。",
  "problemset.mode_badge_mock": "模考",
  "problemset.mode_badge_practice": "练习",
  "exam.sidebar_heading": "题目",
  "exam.sidebar_helper": "已作答",
  "exam.status_answered": "已作答",
  "exam.status_blank": "未作答",
  "exam.status_saving": "保存中",
  "exam.answer_heading": "你的答案",
  "exam.integer_placeholder": "请输入整数",
  "exam.save": "保存",
  "exam.saved": "已保存",
  "exam.save_error": "保存失败，请重试。",
  "exam.saving": "保存中…",
  "exam.saved_at": "已自动保存 {time}",
  "exam.prev": "上一题",
  "exam.next": "下一题",
  "exam.submit_title": "整套提交",
  "exam.submit_helper_mock": "提交后不能修改任何答案。空白将记为未作答。",
  "exam.submit_helper_practice": "准备好之后提交，使用过的提示会反映在报告里。",
  "exam.submit_cta": "提交全部",
  "exam.submit_confirm": "确认现在整套提交？之后将不能修改答案。",
  "exam.submitting": "批改中…",
  "exam.choice_diagram_heading": "选项图",
  "exam.hint_title": "提示",
  "exam.hint_get": "获取提示",
  "exam.hint_after": "下一条提示",
  "exam.hint_empty": "这道题暂未提供提示。",
  "exam.hint_error": "提示加载失败，请重试。",
  "exam.hint_mock_note": "模考模式下不提供提示。",
  "exam.hint_exhausted": "提示已全部展示",
  "problemset.restart_confirm_title": "确定重新开始这道题吗？",
  "problemset.restart_confirm_body": "此操作会**永久删除**你在本题的所有作答、步骤和反馈记录，不可恢复。",
  "problemset.restart_confirm_yes": "确认删除并重新开始",
  "problemset.restart_confirm_cancel": "取消",
  "problemset.restart_in_progress": "正在重置…",
  "problemset.restart_error": "重置失败，请重试。",

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
  "attempt.workspace_subtitle_worked_solution": "把长解答按少数几个段落记录下来。系统不会逐行判分；提交后请对照官方解答检查。",
  "attempt.add_step_label": "添加第 {n} 步",
  "attempt.add_step_button": "添加步骤",
  "attempt.add_step_grading_inline": "正在为你批改这一步…（约 3–5 秒）",
  "attempt.ocr_trigger": "📷 拍照识别这步",
  "attempt.ocr_resizing": "处理图片中…",
  "attempt.ocr_calling": "正在识别你的手写…",
  "attempt.ocr_hint": "请对一步拍清楚照片。识别后你可以校对再保存。",
  "attempt.ocr_error_generic": "识别失败。可以直接打字，或换一张更清楚的照片再试。",
  "attempt.ocr_error_too_big": "图片太大，请换小于 10MB 的照片。",
  "attempt.ocr_error_wrong_type": "这不是图片，请上传 JPG、PNG 或 WebP 格式。",
  "attempt.ocr_retry": "再试一次",
  "attempt.ocr_confidence_high": "识别可信度：高",
  "attempt.ocr_confidence_medium": "识别可信度：中——请核对符号",
  "attempt.ocr_confidence_low": "识别可信度：低——请仔细核对后再保存",
  "attempt.ocr_confidence_none": "识别失败。请换更清楚的照片，或直接打字。",
  "attempt.ocr_unavailable": "拍照识别暂时不可用，请直接打字。",
  "attempt.ocr_review_prompt": "请校对下方识别结果，确认无误后保存。",
  "attempt.ocr_multi_step_trigger": "📷 扫描步骤照片",
  "attempt.ocr_multi_step_hint": "可选择一张或多张清晰照片。我们会自动切分步骤，每一步都由你校对后再保存。",
  "attempt.ocr_quota_exceeded": "今日 OCR 次数已用完（{used}/{limit}）。请明天再来，或先打字提交剩余步骤。",
  "attempt.next_step_hint_button": "下一步提示",
  "attempt.next_step_hint_pending": "正在请教导师…",
  "attempt.next_step_hint_label": "导师提示",
  "attempt.next_step_hint_help": "根据你已经写出的步骤，给一个下一步可以怎么想的小提示。",
  "attempt.next_step_hint_dismiss": "关闭提示",
  "attempt.error_failed_next_step_hint": "没能拿到提示，稍后再试一次。",
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
  "attempt.continue_or_restart_label": "你之前做过这道题",
  "attempt.continue_or_restart_body": "可以继续查看上次的提交，也可以清空重来。",
  "attempt.continue_or_restart_modal_title": "继续作答 还是 重新作答？",
  "attempt.continue_view_submission": "继续 · 查看上次提交",
  "attempt.continue_or_restart_restart": "清空重来",
  "attempt.continue_or_restart_confirm": "这会清掉你上次的步骤、提示和反馈，从零开始。确定要重新做吗？",
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
  "attempt.solution_section_n_label": "解答段落 {n}",
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
  "attempt.submit_row_worked_solution": "写完了？我们会记录你的解答段落，方便你对照官方解答检查。",
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
  "attempt.review_ungraded_short": "已记录 — 不自动判分",
  "attempt.review_ungraded_hint": "Putnam / USAMO / STEP / MAT 等题以证明完整性而非最终数值评分。请对照下方的官方解答检查你的论证。",
  "attempt.reveal_official_solution_for_long_question": "查看官方解答",
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

  "org.students.eyebrow": "教师视图",
  "org.students.title": "组织内学生",
  "org.students.subtitle": "共 {n} 位活跃学生。点击任意一行查看其全部进度。",
  "org.students.back_to_org": "返回组织主页",
  "org.students.empty": "尚无学生加入此组织。请到组织主页邀请学生。",
  "org.students.col_name": "学生",
  "org.students.col_attempts": "作答数",
  "org.students.col_accuracy": "正确率",
  "org.students.col_last_active": "最近活跃",
  "org.students.row_view": "查看",
  "org.students.last_active_never": "—",
  "org.students.last_active_today": "今天",
  "org.students.last_active_yesterday": "昨天",
  "org.students.last_active_days_ago": "{n} 天前",
  "org.students.filter_class_label": "班级",
  "org.students.filter_all_classes": "全部班级",
  "org.students.export_csv": "导出 CSV",
  "org.students.csv_col_correct": "正确数",
  "org.students.csv_col_joined": "加入时间",
  "org.students.csv_col_classes": "所属班级",
  "org.students.parent_invite_heading": "邀请家长查看进度",
  "org.students.parent_invite_helper": "家长会收到一封带有专属链接的邮件，可查看该学生的终身学习进度。链接 30 天内有效，无需注册账号。",
  "org.students.parent_invite_email_label": "家长邮箱",
  "org.students.parent_invite_email_placeholder": "parent@example.com",
  "org.students.parent_invite_relationship_label": "关系（可选）",
  "org.students.parent_invite_relationship_placeholder": "妈妈 / 爸爸 / 监护人",
  "org.students.parent_invite_submit": "发送邀请",
  "org.students.parent_invite_submitting": "发送中…",
  "org.students.parent_invite_success": "邀请已发送。链接有效期至",
  "org.students.parent_invite_err_invalid_email": "请输入有效的邮箱地址。",
  "org.students.parent_invite_err_generic": "出错了，请重试。",
  "org.students.lifetime_eyebrow": "终身进度",
  "org.students.lifetime_attempts": "作答数",
  "org.students.lifetime_accuracy": "正确率",
  "org.students.lifetime_active_days": "活跃天数（近 14 天）",
  "org.students.lifetime_hint_reliance": "提示依赖度",
  "org.students.strengths_heading": "强项",
  "org.students.strengths_empty": "数据还不够，暂时无法识别强项。",
  "org.students.weaknesses_heading": "需重点强化",
  "org.students.weaknesses_empty": "数据还不够，暂时无法识别薄弱知识点。",
  "org.students.mastery_eyebrow": "知识点掌握度（0–5）",
  "org.students.mastery_title": "各知识点掌握度——与学生自己看到的进度报告一致",

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
  "problems.placement.heading": "找到你的难度档 · 免费分级测试",
  "problems.placement.subtitle": "每个赛事三个难度档，选一个最贴近你现状的开始。每套测试都是从真实 AMC 题库按难度精选的，做完结果会清晰告诉你应该从哪一档开始练。",
  "problems.placement.tier_foundation": "基础",
  "problems.placement.tier_intermediate": "中等",
  "problems.placement.tier_advanced": "进阶",
  "problems.placement.level_i_desc": "入门难度题目，对标 AMC 前 10 题。如果你是刚接触竞赛数学的新手，从这里开始。",
  "problems.placement.level_ii_desc": "中等难度，对标 AMC 第 11–20 题。如果前几道题你做起来比较轻松，从这里开始。",
  "problems.placement.level_iii_desc": "竞赛级硬题，对标 AMC 第 21–25 题。如果前一半你都能稳定做对，从这里开始。",
  "problems.placement.contest_amc8": "AMC 8",
  "problems.placement.contest_amc10": "AMC 10",
  "problems.placement.contest_amc12": "AMC 12",
  "problems.placement.contest_subtitle": "三档分级测试",
  "problems.placement.problems_word": "题",
  "problems.amc.heading": "AMC 竞赛题库",
  "problems.amc.subtitle": "AMC 8、10、12 历年真题和按知识点分类的练习题集，全部来自官方公开的真题。",
  "problems.other.heading": "其他竞赛题库",
  "problems.other.subtitle": "AIME、USAMO/USAJMO、Putnam、Euclid、MAT、STEP 等。按赛事和年份浏览。",
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

  "home.hero.kicker": "形式化验证 × 数学竞赛",
  "home.hero.headline": "数学竞赛训练，逐步形式化验证。",
  "home.hero.subhead": "学生写的每一步都由 SymPy 或 Lean 检查，而不是让 LLM 凭感觉打分。真题题库、三引擎验证、零幻觉评分。",
  "home.hero.pill_practice": "SymPy + Lean kernel",
  "home.hero.pill_progress": "逐步评判轨迹",
  "home.hero.pill_aesthetic": "AMC · AIME · Putnam · Euclid · MAT · STEP · USAMO",
  "home.hero.cta_dashboard": "进入我的主页",
  "home.hero.cta_browse_problems": "浏览题库",
  "home.hero.cta_create_account": "注册账号",
  "home.hero.cta_sign_in": "登录",
  "home.hero.cta_student": "学生 · 免费开始",
  "home.hero.cta_school": "我是老师 · 创建学校",
  "home.hero.student_label": "面向学生",
  "home.hero.student_tagline": "AMC 8/10/12、AIME、Putnam 全套题库免费练。每一步都用 SymPy + Lean 真批改，绝无 LLM 胡判。",
  "home.hero.school_label": "面向学校",
  "home.hero.school_tagline": "几分钟批量建班，派发题集，多步证明自动批改。每个学生都有进度报告。",
  "home.hero.signin_prompt": "已有账号？",
  "home.hero.signin_link": "登录",
  "home.stats.practice_label": "题库",
  "home.stats.practice_value": "覆盖全套",
  "home.stats.practice_desc": "AMC 8 / 10 / 12、AIME、USAMO、Putnam、Euclid、MAT、STEP II——每套题的 manifest 都经作者审过，每个比赛周期持续更新。",
  "home.stats.verification_label": "验证",
  "home.stats.verification_value": "三引擎",
  "home.stats.verification_desc": "SymPy 验证代数恒等，Lean kernel 处理形式化逻辑，LLM judge 兜底。每一步明确显示由哪个引擎签的。",
  "home.stats.library_label": "提示",
  "home.stats.library_value": "全部预生成",
  "home.stats.library_desc": "每道题三段递进提示均已预生成。即使 LLM 暂时不可用，学生也能拿到与题目高度相关的提示，不会再是无意义的占位文本。",
  "home.cards.eyebrow": "验证引擎栈",
  "home.cards.headline": "三个引擎、一个裁决",
  "home.cards.lede": "学生写下的每一步先用确定性数学引擎检查；只有当符号化后端拿不准时，我们才升级给 LLM judge — 或者直接转给老师。",
  "home.demo.ocr_eyebrow": "01 / 拍照识别",
  "home.demo.ocr_title": "手写一拍，秒变 LaTeX，确认即提交。",
  "home.demo.grading_eyebrow": "02 / 批改",
  "home.demo.grading_title": "实时看一步推导被验证的全过程。",
  "home.demo.hint_eyebrow": "03 / 提示",
  "home.demo.hint_title": "渐进式提示——先方向，最后才是答案。",
  "home.demo.report_eyebrow": "04 / 报告",
  "home.demo.report_title": "每次刷题后都有清晰画像。",
  "home.hero.florid_word": "可验证",
  "home.cards.sympy_title": "01 / SymPy",
  "home.cards.sympy_body": "代数恒等、方程化简、简单不等式。学生写 2x = 4，SymPy 毫秒级返回 VERIFIED。无需 LLM 往返。",
  "home.cards.lean_title": "02 / Lean kernel",
  "home.cards.lean_body": "证明级步骤进入 Lean 内核做类型检查。几何、数论、归纳——只要 type-check 通过，就是真的对。LLM 没法骗过 kernel。",
  "home.cards.llm_title": "03 / LLM judge",
  "home.cards.llm_body": "Lean 和 SymPy 暂时还覆盖不到的（组合、几何直觉），由 LLM judge 给一个判断——并明确标记是哪个引擎打的，让学生看清来源。",
  "home.helps.kicker": "为什么是 Lean 而不是普通 LLM",
  "home.helps.headline": "让 LLM 给数学打分就是在猜。Kernel 不会猜。",
  "home.helps.subhead": "ChatGPT 会因为一道错的证明听起来合理就告诉学生它对。我们的 kernel 直接拒绝。这就是整个 wedge。",
  "home.helps.assignments_title": "逐步评判",
  "home.helps.assignments_body": "每一步显示 VERIFIED / PLAUSIBLE / INVALID 以及哪个引擎给的判断。没有黑盒分数。",
  "home.helps.resources_title": "真题题库",
  "home.helps.resources_body": "AMC、AIME、Putnam、Euclid、MAT、STEP、USAMO——手工编写的 manifest，题干 + 官方解答梗概都经验证。",
  "home.helps.guided_title": "三级提示",
  "home.helps.guided_body": "建库时即预先生成。Hint 1 给方向，Hint 2 给结构，Hint 3 给路径轮廓——但绝不剧透答案。",
  "home.helps.reports_title": "老师视图",
  "home.helps.reports_body": "老师能看到每一步是哪个引擎验证的、学生用了哪些提示、证明在哪一步断了。不是凭感觉拉的进度条。",
  "home.quickstart.badge_member": "继续学习",
  "home.quickstart.badge_guest": "快速开始",
  "home.quickstart.title_member": "回到你的学习流程。",
  "home.quickstart.title_guest": "用清爽简单的设置开始。",
  "home.quickstart.body_member": "主要功能就在手边，随时打开继续。",
  "home.quickstart.body_guest": "注册学生账号或登录，以个性化你的仪表板、作业与报告。",
  "home.quickstart.role_member": "会员",
  "home.quickstart.role_guest": "访客",
  "home.quickstart.link_dashboard": "进入我的主页",
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
