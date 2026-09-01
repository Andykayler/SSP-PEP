import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/student.dart';
import '../state/session_provider.dart';
import '../theme/app_colors.dart';
import 'home_shell.dart';

class StudentSelectScreen extends StatefulWidget {
  const StudentSelectScreen({super.key});

  @override
  State<StudentSelectScreen> createState() => _StudentSelectScreenState();
}

class _StudentSelectScreenState extends State<StudentSelectScreen> {
  final _searchCtrl = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    final all = session.students;
    final filtered = _query.isEmpty
        ? all
        : all.where((s) {
            final q = _query.toLowerCase();
            return s.fullName.toLowerCase().contains(q) ||
                s.className.toLowerCase().contains(q) ||
                s.schoolName.toLowerCase().contains(q);
          }).toList();

    return Scaffold(
      backgroundColor: context.colors.bg,
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: _Hero(
                totalStudents: all.length,
                searchCtrl: _searchCtrl,
                onSearchChanged: (v) => setState(() => _query = v),
                onLogout: () => session.logout(),
                showSearch: all.length > 4,
              ),
            ),
            if (all.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: _EmptyState(),
              )
            else if (filtered.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: _NoResultsState(),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
                sliver: SliverLayoutBuilder(
                  builder: (context, constraints) {
                    final wide = constraints.crossAxisExtent > 520;
                    return SliverGrid(
                      gridDelegate:
                          SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: wide ? 2 : 1,
                        mainAxisSpacing: 14,
                        crossAxisSpacing: 14,
                        childAspectRatio: wide ? 3.1 : 3.6,
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (context, i) {
                          final Student s = filtered[i];
                          return _StudentCard(
                            student: s,
                            onTap: () async {
                              await session.selectStudent(s);
                              if (context.mounted) {
                                Navigator.of(context).pushReplacement(
                                  MaterialPageRoute(
                                      builder: (_) => const HomeShell()),
                                );
                              }
                            },
                          );
                        },
                        childCount: filtered.length,
                      ),
                    );
                  },
                ),
              ),
            const SliverToBoxAdapter(child: _Footer()),
          ],
        ),
      ),
    );
  }
}

/// ─── Hero header, matching .overview-hero + .search-wrap ────────────────
class _Hero extends StatelessWidget {
  final int totalStudents;
  final TextEditingController searchCtrl;
  final ValueChanged<String> onSearchChanged;
  final VoidCallback onLogout;
  final bool showSearch;

  const _Hero({
    required this.totalStudents,
    required this.searchCtrl,
    required this.onSearchChanged,
    required this.onLogout,
    required this.showSearch,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      padding: const EdgeInsets.fromLTRB(24, 26, 24, 26),
      decoration: BoxDecoration(
        color: context.colors.heroBg,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: context.colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(width: 16, height: 1, color: context.colors.warning),
                        const SizedBox(width: 8),
                        Text(
                          'ACALink',
                          style: TextStyle(
                            fontFamily: context.colors.fontMono,
                            fontSize: 9,
                            letterSpacing: 3,
                            fontWeight: FontWeight.w600,
                            color: context.colors.textMuted,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Choose a child',
                      style: TextStyle(
                        fontFamily: context.colors.fontDisplay,
                        fontSize: 28,
                        letterSpacing: 0.3,
                        fontWeight: FontWeight.w500,
                        color: context.colors.textPrimary,
                        height: 1.1,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      totalStudents == 0
                          ? 'No students linked to this account yet'
                          : 'Select a student profile to continue',
                      style: TextStyle(
                        fontSize: 13,
                        color: context.colors.textSecondary,
                        fontWeight: FontWeight.w400,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              _LogoutPill(onTap: onLogout),
            ],
          ),
          if (showSearch) ...[
            const SizedBox(height: 20),
            _SearchField(controller: searchCtrl, onChanged: onSearchChanged),
          ],
        ],
      ),
    );
  }
}

class _LogoutPill extends StatelessWidget {
  final VoidCallback onTap;
  const _LogoutPill({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: context.colors.bg,
            border: Border.all(color: context.colors.border),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.logout, size: 15, color: context.colors.textSecondary),
              SizedBox(width: 6),
              Text(
                'Sign out',
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w500,
                  color: context.colors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  const _SearchField({required this.controller, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 44,
      decoration: BoxDecoration(
        color: context.colors.bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.colors.border),
      ),
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        style: TextStyle(fontSize: 13.5, color: context.colors.textPrimary),
        decoration: InputDecoration(
          isDense: true,
          border: InputBorder.none,
          hintText: 'Search by name, class, or school',
          hintStyle: TextStyle(fontSize: 13.5, color: context.colors.textMuted),
          prefixIcon: Icon(Icons.search, size: 18, color: context.colors.textMuted),
          contentPadding: const EdgeInsets.symmetric(vertical: 12),
        ),
      ),
    );
  }
}

/// ─── Student card, matching .module-card in light mode ──────────────────
class _StudentCard extends StatelessWidget {
  final Student student;
  final VoidCallback onTap;
  const _StudentCard({required this.student, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final initial = student.fullName.isNotEmpty ? student.fullName[0] : '?';

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        hoverColor: context.colors.cardBgHover,
        splashColor: context.colors.primaryPale,
        child: Ink(
          decoration: BoxDecoration(
            color: context.colors.cardBg,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: context.colors.border),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [context.colors.navyStart, context.colors.navyEnd],
                  ),
                  borderRadius: BorderRadius.circular(12),
                ),
                alignment: Alignment.center,
                child: Text(
                  initial.toUpperCase(),
                  style: TextStyle(
                    fontFamily: context.colors.fontDisplay,
                    fontSize: 16,
                    color: Colors.white,
                    letterSpacing: 1,
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      student.fullName,
                      style: TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w600,
                        color: context.colors.textPrimary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${student.className} · ${student.schoolName}',
                      style: TextStyle(
                        fontFamily: context.colors.fontMono,
                        fontSize: 10,
                        letterSpacing: 0.4,
                        color: context.colors.textMuted,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: context.colors.primaryPale,
                  borderRadius: BorderRadius.circular(9),
                ),
                alignment: Alignment.center,
                child: Icon(
                  Icons.chevron_right,
                  size: 16,
                  color: context.colors.primaryLight,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// ─── Empty / no-results states ───────────────────────────────────────────
class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: context.colors.primaryPale,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(Icons.person_off_outlined,
                  color: context.colors.primaryLight, size: 24),
            ),
            const SizedBox(height: 16),
            Text(
              'No students linked yet',
              style: TextStyle(
                fontFamily: context.colors.fontDisplay,
                fontSize: 16,
                fontWeight: FontWeight.w500,
                color: context.colors.textPrimary,
              ),
            ),
            const SizedBox(height: 5),
            Text(
              'Ask the school to link a student to your account.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12.5, color: context.colors.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}

class _NoResultsState extends StatelessWidget {
  const _NoResultsState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: context.colors.warningPale,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(Icons.search_off, color: context.colors.warning, size: 22),
            ),
            const SizedBox(height: 14),
            Text(
              'No matches',
              style: TextStyle(
                fontFamily: context.colors.fontDisplay,
                fontSize: 15,
                fontWeight: FontWeight.w500,
                color: context.colors.textPrimary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Try a different name, class, or school.',
              style: TextStyle(fontSize: 12.5, color: context.colors.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}

/// ─── Footer, matching .dashboard-footer ──────────────────────────────────
class _Footer extends StatelessWidget {
  const _Footer();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 20),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            '© 2026 SSP-PEP · Ministry of Education, Malawi',
            style: TextStyle(
              fontFamily: context.colors.fontMono,
              fontSize: 9,
              letterSpacing: 0.5,
              color: context.colors.textMuted.withOpacity(0.8),
            ),
          ),
          Text(
            'v1.4.1',
            style: TextStyle(
              fontFamily: context.colors.fontMono,
              fontSize: 9,
              letterSpacing: 0.5,
              color: context.colors.textMuted.withOpacity(0.8),
            ),
          ),
        ],
      ),
    );
  }
}