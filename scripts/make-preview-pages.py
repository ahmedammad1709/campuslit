"""Builds the four sample pages used by the settings-page live preview (extension/preview/{lms,cms}/*.html).

The markup mirrors the structure of the real portals (AdminLTE for the LMS, the Aspire theme for the CMS) so the real
lms.css / cms.css / lms.js / cms.js apply to it unchanged. All names, courses and numbers are invented.
Run:  python scripts/make-preview-pages.py   (output is committed; only needed when changing the samples)
"""
import html
import json
import os
import urllib.parse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'extension', 'preview'))

# a plain, neutral round badge (not the university's emblem)
EMBLEM = 'data:image/svg+xml,' + urllib.parse.quote(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#fff" stroke="#c9a24a" stroke-width="3"/>'
    '<path d="M32 12 48 20v14c0 10-7 16-16 20-9-4-16-10-16-20V20z" fill="#0b1d40"/><path d="M24 31h16M32 23v16" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>')
AVATAR = 'data:image/svg+xml,' + urllib.parse.quote(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#e7ebf5"/><circle cx="32" cy="25" r="11" fill="#9aa6c4"/><path d="M10 60c2-14 12-20 22-20s20 6 22 20z" fill="#9aa6c4"/></svg>')
NAME = 'Ayesha Khan'
ENROLL = '02-000000-000'

# ------------------------------------------------------------------ LMS
LMS_MENU = [
    ('dashboard.html', 'fa-dashboard', 'Dashboard'), ('#', 'fa-bars', 'Course Outline'), ('#', 'fa-file-text-o', 'Course Plan'),
    ('#', 'fa-th', 'Lecture Notes'), ('assignments.html', 'fa-files-o', 'Assignments'), ('#', 'fa-building-o', 'Quizzes'),
    ('#', 'fa-object-group', 'Miscellaneous'), ('#', 'fa-object-group', 'Papers'), ('#', 'fa-bullhorn', 'Announcements'),
    ('#', 'fa-object-group', 'Guidelines'), ('#', 'fa-life-saver', 'Online Library Resources'), ('#', 'fa-list', 'FAQs'),
    ('#', 'fa-fw fa-list-ul', 'Understanding Quran'),
]


def lms_page(title, content):
    menu = ''.join(
        f'<li{" class=\"active\"" if href == "dashboard.html" else ""}><a href="{href}"><i class="fa {icon}"></i> <span>{label}</span></a></li>'
        for href, icon, label in LMS_MENU)
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="stylesheet" href="../vendor/css/bootstrap.min.css"><link rel="stylesheet" href="../vendor/css/AdminLTE.min.css">
<link rel="stylesheet" href="../vendor/css/skin-yellow-light.min.css"><link rel="stylesheet" href="../vendor/css/font-awesome.min.css">
<link rel="stylesheet" href="../preview.css"><link rel="stylesheet" href="../preview-lms.css">
<link rel="stylesheet" href="../../portal.css"><link rel="stylesheet" href="../../lms.css">
<script src="../../themes.js" defer></script><script src="../../lms.js" defer></script><script src="../preview.js" defer data-site="lms"></script>
</head>
<body class="hold-transition skin-yellow-light sidebar-mini"><div class="wrapper">
<header class="main-header">
  <a href="dashboard.html" class="logo"><span class="logo-mini"><b><img src="{EMBLEM}" alt=""></b></span><span class="logo-lg" style="font-size: 18px; font-weight: bold"><b><img src="{EMBLEM}" alt=""></b>Bahria University</span></a>
  <nav class="navbar navbar-static-top">
    <a href="#" class="sidebar-toggle" data-toggle="push-menu" role="button"><span class="sr-only">Toggle navigation</span></a>
    <h4 class="text-center col-xs-8 text-bold" style="color: #fff; font-size: 24px;">Learning Management System</h4>
    <div class="navbar-custom-menu"><ul class="nav navbar-nav">
      <li class="dropdown notifications-menu"><a href="#" class="dropdown-toggle"><i class="fa fa-bell-o"></i><span class="label label-warning" title="">
        </span></a></li>
      <li class="dropdown user user-menu"><a href="#" class="dropdown-toggle"><img src="{AVATAR}" class="user-image" alt="User Image"><span class="hidden-xs">{NAME.upper()}</span></a>
        <ul class="dropdown-menu" style="width: 220px;"><li class="user-header"><img src="{AVATAR}" class="img-circle" alt="User Image"><p>{ENROLL}<br>{NAME.upper()}</p></li>
        <li class="user-footer"><div class="pull-left"></div><div class="pull-right"><a href="#" class="btn btn-default btn-flat">Sign out</a></div></li></ul></li>
    </ul></div>
  </nav>
</header>
<aside class="main-sidebar"><section class="sidebar"><ul class="sidebar-menu" data-widget="tree">{menu}</ul></section></aside>
{content}
<footer class="main-footer"><div class="pull-right hidden-xs"></div><strong>Sample content. Not a real portal page.</strong></footer>
</div></body></html>
'''


COURSES = [
    ('Data Structures', 'BSE[4]-5 (B) Morning'), ('Data Structures Lab', 'BSE[4]-5 (B) Morning'),
    ('Database Systems', 'BSE[4]-5 (B) Morning'), ('Database Systems Lab', 'BSE[4]-5 (B) Morning'),
    ('Operating Systems', 'BSE[4]-5 (B) Morning'), ('Software Engineering', 'BSE[4]-5 (B) Morning'),
    ('Computer Networks', 'BSE[4]-5 (B) Morning'), ('Computer Networks Lab', 'BSE[4]-5 (B) Morning'),
]


def lms_dashboard():
    rows = ''.join(f'<tr><td>{i} </td><td>{c} </td><td>{k} </td><td>Fall-2026 </td></tr>' for i, (c, k) in enumerate(COURSES, 1))
    content = f'''<div class="content-wrapper">
  <section class="content-header"><h1 class="bg-gray pad">Dashboard<small></small></h1></section>
  <section class="content"><div class="row"><div class="col-xs-12"><div class="box">
    <div class="box-header"><div class="col-lg-3"><h3 class="box-title">Courses Registered</h3></div>
      <div class="col-lg-8"><div class="col-xs-1"> Semester: </div><div class="col-xs-6"><form action="#"><select class="form-control"><option>Fall-2026</option><option>Spring-2026</option></select></form></div></div></div>
    <div class="box-body table-responsive no-padding"><table class="table table-hover"><tbody>
      <tr><th width="5%">Sr.No.</th><th width="20%">Course Title</th><th width="20%">Class</th><th width="20%">Semester</th></tr>{rows}
    </tbody></table></div></div></div></div>
    <div class="text-red">* Courses from CMS will be available here after 1 hour.</div></section>
</div>'''
    return lms_page('Dashboard · LMS (sample)', content)


def lms_assignments():
    def row(n, title, ext, orig, marks, submitted):
        sub = '<a href="#" class="label label-info"><i class="fa fa-download"></i> Submission</a>' if submitted else 'No Submission'
        return f'''<tr><td>{n}</td><td>{title}</td>
<td><a href="#" class="label label-info"><i class="fa fa-download"></i> Assignment</a><br><a href="#" class="label label-info"><i class="fa fa-download"></i> Solution</a><br><span class="label label-default" title="No Remarks" style="cursor:pointer">Hover To View</span></td>
<td>{sub}</td><td>{marks}</td>
<td>---<br><span class="label label-default" title="Good work." style="cursor:pointer">Hover To View Comments</span></td>
<td><div style='background:red; color:#fff; text-align:center; border-radius:4px; padding:5px 0px; line-height: 18px;'>Deadline Exceeded</div></td>
<td><small class='label label-warning' title='Extended '>{ext}</small><br/><small class='label label-info' title='Actual'>{orig}</small></td></tr>'''
    rows = (row(1, 'Quiz 1: Arrays and Linked Lists', '29 September 2026 - 11:55 pm', '27 September 2026-11:55 pm', '5.000', True)
            + row(2, 'Assignment 2: Trees and Graphs', '15 October 2026 - 11:55 pm', '12 October 2026-11:55 pm', 'Not marked yet', False)
            + row(3, 'Lab Task 3: Hash Tables', '29 October 2026 - 11:55 pm', '26 October 2026-11:55 pm', 'Not marked yet', False))
    content = f'''<div class="content-wrapper">
  <section class="content-header"><h1 class="bg-gray pad">Assignments<small></small></h1></section>
  <section class="content"><div class="row"><div class="col-xs-12"><div class="box">
    <div class="box-header text-center">
      <div class="col-lg-6"><div class="col-xs-2">Semester:</div><div class="col-xs-6"><form action="#"><select class="form-control"><option>Fall-2026</option></select></form></div></div>
      <div class="col-lg-6"><div class="col-xs-2"> Course : </div><div class="col-xs-6"><form action="#"><select class="form-control"><option>Data Structures</option><option>Database Systems</option></select></form></div></div>
    </div>
    <div class="box-body table-responsive no-padding"><table class="table table-hover"><tbody>
      <tr><th width="5%">Assign. No.</th><th width="15%">Title</th><th width="20%">Assignment <br> (Solution File) <br> Remarks</th><th width="10%">Added Submission</th><th width="10%">Marks Obtained</th><th width="10%">Returned Submission <br> (Comments)</th><th width="10%">Action</th><th width="10%">Deadline</th></tr>
      {rows}
    </tbody></table></div></div></div></div></section>
</div>'''
    return lms_page('Assignments · LMS (sample)', content)


# ------------------------------------------------------------------ CMS
CMS_MENU = [
    ('/Sys/Student/Profile.aspx', 'Profile Information', None),
    (None, 'Course Registration', [('/Sys/Student/CourseRegistration/RegisteredCourses.aspx', 'Registered Courses'), ('/Sys/Student/CourseRegistration/RegisterRegularCourses.aspx', 'Register Regular Courses'), ('/Sys/Student/CourseRegistration/OfferedCourses.aspx', 'View Offered Courses'), ('/Sys/Student/CourseRegistration/CreditsTransfer.aspx', 'Credits Transfer')]),
    (None, 'Courses', [('timetable.html', 'Time Table'), ('attendance.html', 'Attendance')]),
    (None, 'Exams', [('/Sys/Student/Exams/ExamResult.aspx', 'Provisional Result'), ('/Sys/Student/ExamSeatingPlan/ExamSeats', 'Exam Seating Plan'), ('/Sys/Student/Exams/CommunityServices.aspx', 'Community Services')]),
    (None, 'Underperforming Students', [('/Sys/Student/ExtraTeachingSessions.aspx', 'Extra Teaching Sessions')]),
    ('/Sys/Student/QualityAssurance/QualityAssuranceSurveys.aspx', 'Quality Assurance Surveys', None), ('/Sys/Student/FeeManagement/FeeChallans', 'Fee Challans', None), ('/Sys/Student/StudentInformation/AcademicDocuments.aspx', 'Academic Documents', None),
    ('/Sys/Student/Scholarships/AvailableScholarships.aspx', 'Available Scholarships', None), ('/Sys/Student/Forms/Forms.aspx', 'Forms', None), ('/Sys/Student/StudentInformation/EUndertakings.aspx', 'EUndertakings', None), ('/Sys/Common/GoToLMS.aspx', 'Go To LMS', None),
    ('/Sys/Student/EmailAccount.aspx', 'Microsoft Email Account', None), ('/Sys/Student/OfficialDocuments/Documents.aspx', 'Official Documents', None), ('/Sys/Student/Undertakings/Undertakings.aspx', 'Undertakings', None),
    ('/Sys/Student/Pgp/Dashboard.aspx', 'Thesis Dashboard', None), ('/Sys/Student/ConvocationRegistration.aspx', 'Convocation Registration', None), ('/Sys/Common/Feedbacks/Feedbacks.aspx', 'Virtual Suggestion Box', None),
]


def cms_sidebar(open_menu):
    out = []
    n = 0
    for href, label, subs in CMS_MENU:
        if subs is None:
            out.append(f'<a class="list-group-item " data-parent="#sideMenuList" target="_self" href="{href}">{label}</a>')
            continue
        n += 1
        opened = label == open_menu
        out.append(f'<a class="list-group-item {"" if opened else "collapsed"} " data-parent="#sideMenuList" data-toggle="collapse" href="#sideMenuList_{n}">{label}'
                   '<i aria-hidden="true" class="fa fa-caret-down pull-right"></i><i aria-hidden="true" class="fa fa-caret-right"></i></a>')
        inner = ''.join(f'<a class="list-group-item " data-parent="#sideMenuList_{n}" target="_self" href="{h}">{t}</a>' for h, t in subs)
        out.append(f'<div class="collapse {"in" if opened else ""} list-group-subMenu " id="sideMenuList_{n}">{inner}</div>')
    return ''.join(out)


def cms_page(title, heading_icon, heading, crumbs, body, open_menu=None):
    crumb_html = ''
    if crumbs:
        items = ''.join(f'<li><a href="#">{c}</a></li>' for c in crumbs[:-1]) + f'<li class="active">{crumbs[-1]}</li>'
        crumb_html = f'<div id="breadCrumb" class="hidden-sm hidden-xs"><ol class="breadcrumb"><li><a href="dashboard.html" title="Home"><i aria-hidden="true" class="fa fa-desktop fa-1"></i> Home</a></li>{items}</ol></div>'
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="stylesheet" href="../vendor/css/bootstrap.min.css"><link rel="stylesheet" href="../preview.css"><link rel="stylesheet" href="../preview-cms.css">
<link rel="stylesheet" href="../../portal.css"><link rel="stylesheet" href="../../cms.css">
<script src="../../themes.js" defer></script><script src="../../attendance.js" defer></script><script src="../../cms.js" defer></script><script src="../preview.js" defer data-site="cms"></script>
</head>
<body class="Army"><form method="post" action="#" id="form1" autocomplete="off">
<div id="pageContainer">
<header id="header" class="navbar navbar-fixed-top"><div class="container-fluid">
  <div class="navbar-header">
    <a id="aSideBar" class="navbar-brand"><span class="glyphicon glyphicon-menu-hamburger" id="logIcon"></span></a>
    <a href="dashboard.html" id="brandName" class="navbar-brand Name">Bahria University Karachi Campus</a>
    <a href="dashboard.html" id="brandShortName" class="navbar-brand ShortName">Karachi Campus</a>
    <a href="dashboard.html" id="brandAlias" class="navbar-brand Alias">BUKC</a>
  </div>
  <div class="collapse navbar-collapse" id="AccountsNavbar"><ul class="nav navbar-nav navbar-right"><li class="dropdown">
    <a href="#" class="dropdown-toggle"><img class="avatar" width="32" height="32" src="{AVATAR}" alt=""><span class="name">{ENROLL}</span><span class="caret"></span></a>
  </li></ul></div>
</div></header>
<aside id="sideBar"><div class="list-group panel" id="sideMenuList">{cms_sidebar(open_menu)}</div></aside>
<div id="pageContent">
{crumb_html}
<div id="pageHeading"><h1 id="pageTitle_h1" class="text-left"><span id="pageTitle_icon" class="{heading_icon}"></span> {heading}</h1></div>
<div class="container-fluid"><div id="pageAlerts_up"></div>
{body}
</div></div></div>
<footer id="footer">2026 &copy; <a href="#">Sample content. Not a real portal page.</a></footer>
</form></body></html>
'''


ATTENDANCE = [   # code, title, credit hours, present, absent, total (percentage is worked out below)
    ('CSC 220', 'Data Structures', '3', 24.0, 0.0, 24.0),
    ('CSL 220', 'Data Structures Lab', '1', 21.0, 0.0, 21.0),
    ('CSC 340', 'Database Systems', '3', 22.0, 2.0, 24.0),
    ('CSL 340', 'Database Systems Lab', '1', 14.0, 1.0, 15.0),
    ('CSC 360', 'Operating Systems', '3', 20.0, 4.0, 24.0),
    ('SEN 311', 'Software Engineering', '3', 18.0, 4.0, 22.0),
    ('CEN 223', 'Computer Networks', '3', 15.0, 6.0, 21.0),
    ('CEL 223', 'Computer Networks Lab', '1', 21.0, 0.0, 21.0),
]


def pct(present, total):
    v = round(present / total * 100, 2)
    return str(int(v)) if v == int(v) else str(v)


def cms_attendance():
    teachers = ['DR. SANA MALIK', 'ENGR. BILAL HUSSAIN', 'DR. AMNA RAZA', 'ENGR. HASSAN SHEIKH']
    rows = ''
    for i, (c, t, h, p, a, tot) in enumerate(ATTENDANCE, 1):
        rows += (f'<tr><td class="text-center">{i}</td><td class="text-center">{c}</td><td>{t}</td><td class="text-center">{h}</td><td class="text-center">N/A </td>'
                 f'<td>{t}</td><td>BSE[4]-5 (B) Morning</td><td>{teachers[i % 4]} </td><td class="text-center">Paid </td>'
                 f'<td class="text-center">{p} :{pct(p, tot)}%</td><td class="text-center">{a} </td><td class="text-center">{tot} </td><td class="text-center"><a href="#" target="_blank">Detail</a></td></tr>')
    body = f'''<div class="table-responsive"><table class="table table-bordered table-responsive table-condensed table-hover"><caption>Fall-2026</caption>
<thead><tr><th class="text-center">#</th><th class="text-center">Code</th><th>Registered Course Title</th><th class="text-center">Credit<br /> Hours</th><th class="text-center">Majors</th><th>Offered Course Title</th><th>Class</th><th>Teacher Name</th><th>Fee Status</th><th>Present Hours</th><th>Absent Hours</th><th>Total Hours</th><th>Actions</th></tr></thead>
<tbody>{rows}</tbody></table></div>'''
    return cms_page('Attendance · CMS (sample)', 'glyphicon glyphicon-import', 'Attendance', ['Courses', 'Attendance'], body, open_menu='Courses')


def cms_dashboard():
    data = json.dumps([{'code': c, 'title': t, 'creditHours': h, 'present': p, 'absent': a, 'total': tot, 'percentage': pct(p, tot)}
                       for c, t, h, p, a, tot in ATTENDANCE])
    body = f'''<div class="row margin-bottom-15">
<div class="col-md-6"><div class="panel panel-default notification-container"><div class="panel-heading"><h3 class="panel-title">Notifications</h3></div>
  <div class="scroll-container"><div id="scroll-text">
    <div class="card"><div class="card-header"><h5 class="fas fa-bell notification-heading">Mid-term examinations</h5></div><div class="card-body"><div class="notification-content">The mid-term examination schedule has been published. Please check your seating plan and report 15 minutes before each paper.</div></div></div>
    <div class="card"><div class="card-header"><h5 class="fas fa-bell notification-heading">Fee challan reminder</h5></div><div class="card-body"><div class="notification-content">Students with an unpaid challan should clear their dues before the date on the challan to avoid a late fee.</div></div></div>
  </div></div></div></div>
<div class="col-md-6"><div class="panel panel-default attendance-container"><div class="panel-heading"><h3 class="panel-title">Attendance Summary<small class="pull-right"><span>Fall-2026</span></small></h3></div>
  <div class="attendance-body"><div id="BodyPH_divAttendanceSummaryChart" class="attendance-canvas-wrapper"><canvas id="attendanceSummaryCanvas"></canvas></div></div></div></div>
</div>
<script type="text/plain">renderAttendanceSummaryChart({data});</script>'''
    return cms_page('Dashboard · CMS (sample)', 'fas fa-desktop', 'Dashboard', None, body)


def slots(start, end):
    return ''.join('1' if start <= i * 15 < end else '0' for i in range(96))


def cms_timetable():
    sm, bh, ar, hs = ('DR. SANA MALIK', 'DRSM-I'), ('ENGR. BILAL HUSSAIN', 'EBH-I'), ('DR. AMNA RAZA', 'DAR-I'), ('ENGR. HASSAN SHEIKH', 'EHS-I')
    plan = [  # day, start, end, title, short, room, teacher
        (1, 510, 630, 'Data Structures', 'DS', 'R-204', sm), (1, 630, 750, 'Database Systems', 'DB', 'R-204', bh), (1, 750, 840, 'Operating Systems', 'OS', 'R-204', ar),
        (2, 510, 630, 'Software Engineering', 'SE', 'R-208', hs), (2, 690, 870, 'Database Systems Lab', 'DBL', 'Lab-2', bh), (2, 870, 990, 'Computer Networks', 'CN', 'R-208', ar),
        (3, 690, 870, 'Data Structures Lab', 'DSL', 'Lab-1', sm), (3, 870, 1050, 'Computer Networks Lab', 'CNL', 'Lab-3', ar),
        (4, 690, 780, 'Data Structures', 'DS', 'R-203', sm), (4, 780, 900, 'Operating Systems', 'OS', 'R-203', ar),
        (5, 690, 780, 'Software Engineering', 'SE', 'R-203', hs), (5, 780, 870, 'Computer Networks', 'CN', 'R-203', ar),
    ]
    events = []
    for day, s, e, title, short, room, (tn, ts) in plan:
        events.append({'resourceID': '', 'weekDay': day, 'timeSlot': slots(s, e), 'timing': f'{s // 60}:{s % 60:02d} - {e // 60}:{e % 60:02d}',
                       'data': {'cssClass': 'Color0', 'registered': False, 'calendarType': 'Overall', 'courseTitle': title, 'shortCourseTitle': short,
                                'className': 'BSE[4]-5 (B) Morning', 'shortClassName': 'BSE[4]-5B-M', 'facultyMemberName': tn, 'shortFacultyMemberName': ts,
                                'roomName': room, 'buildingAlias': 'MAIN BLOCK', 'buildingName': 'MAIN BLOCK'}})
    blob = {'semester': 'Fall-2026', 'timeSlots': slots(480, 1080), 'resources': [{'id': '', 'type': '', 'name': '', 'data': None}], 'eventsData': events,
            'tableCaption': '', 'resourceColumnHeaderText': 'Calendar', 'displayResourceColumn': False}
    value = html.escape(json.dumps(blob), quote=True)
    body = f'''<div id="BodyPH_updatePanelCalendar">
<input type="hidden" name="hfCalendarJson" id="BodyPH_hfCalendarJson" value="{value}">
<div class="table-responsive"><table id="timeTable"><caption>Fall-2026</caption><tbody><tr><td>The time table grid appears here on the real portal.</td></tr></tbody></table></div>
</div>'''
    return cms_page('Time Table · CMS (sample)', 'glyphicon glyphicon-calendar', 'Time Table', ['Courses', 'Time Table'], body, open_menu='Courses')


def write(rel, text):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf8', newline='\n') as f:
        f.write(text)


write('lms/dashboard.html', lms_dashboard())
write('lms/assignments.html', lms_assignments())
write('cms/dashboard.html', cms_dashboard())
write('cms/timetable.html', cms_timetable())
write('cms/attendance.html', cms_attendance())
print('wrote 5 preview pages')
