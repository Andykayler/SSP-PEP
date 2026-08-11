import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/student.dart';
import '../state/session_provider.dart';
import 'home_shell.dart';

/// ─── Light theme tokens, mirrored from the SSP-PEP web dashboard CSS ─────
/// Cream/navy/gold system — pull exact values from your real
/// [data-theme="light"] variables once you have them centralized.
class _T {
  static const bg = Color(0xFFF8F6F0); // cream page background
  static const heroBg = Color(0xFFFFFFFF);
  static const cardBg = Color(0xFFFFFFFF);
  static const cardBgHover = Color(0xFFF3F0E8);
  static const border = Color(0xFFE3DFD3);
  static const borderStrong = Color(0xFFCDC7B5);

  static const textPrimary = Color(0xFF1E2A44); // deep navy
  static const textSecondary = Color(0xFF5B6478);
  static const textMuted = Color(0xFF95978F);

  static const primary = Color(0xFF4F6EF7);
  static const primaryLight = Color(0xFF3454E0);
  static const primaryPale = Color(0x144F6EF7);

  static const navyStart = Color(0xFF2D3A5E);
  static const navyEnd = Color(0xFF3D4F7A);

  static const warning = Color(0xFFC47D0E);
  static const warningPale = Color(0x1AE8A800);

  static const fontMono = 'monospace';
  static const fontDisplay = null;
}

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
      backgroundColor: _T.bg,
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
        color: _T.heroBg,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: _T.border),
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
                        Container(width: 16, height: 1, color: _T.warning),
                        const SizedBox(width: 8),
                        Text(
                          'ACALink',
                          style: TextStyle(
                            fontFamily: _T.fontMono,
                            fontSize: 9,
                            letterSpacing: 3,
                            fontWeight: FontWeight.w600,
                            color: _T.textMuted,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Choose a child',
                      style: TextStyle(
                        fontFamily: _T.fontDisplay,
                        fontSize: 28,
                        letterSpacing: 0.3,
                        fontWeight: FontWeight.w500,
                        color: _T.textPrimary,
                        height: 1.1,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      totalStudents == 0
                          ? 'No students linked to this account yet'
                          : 'Select a student profile to continue',
                      style: const TextStyle(
                        fontSize: 13,
                        color: _T.textSecondary,
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
            color: _T.bg,
            border: Border.all(color: _T.border),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.logout, size: 15, color: _T.textSecondary),
              SizedBox(width: 6),
              Text(
                'Sign out',
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w500,
                  color: _T.textSecondary,
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
        color: _T.bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _T.border),
      ),
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        style: const TextStyle(fontSize: 13.5, color: _T.textPrimary),
        decoration: InputDecoration(
          isDense: true,
          border: InputBorder.none,
          hintText: 'Search by name, class, or school',
          hintStyle: const TextStyle(fontSize: 13.5, color: _T.textMuted),
          prefixIcon: const Icon(Icons.search, size: 18, color: _T.textMuted),
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
        hoverColor: _T.cardBgHover,
        splashColor: _T.primaryPale,
        child: Ink(
          decoration: BoxDecoration(
            color: _T.cardBg,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: _T.border),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [_T.navyStart, _T.navyEnd],
                  ),
                  borderRadius: BorderRadius.circular(12),
                ),
                alignment: Alignment.center,
                child: Text(
                  initial.toUpperCase(),
                  style: const TextStyle(
                    fontFamily: _T.fontDisplay,
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
                      style: const TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w600,
                        color: _T.textPrimary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${student.className} · ${student.schoolName}',
                      style: const TextStyle(
                        fontFamily: _T.fontMono,
                        fontSize: 10,
                        letterSpacing: 0.4,
                        color: _T.textMuted,
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
                  color: _T.primaryPale,
                  borderRadius: BorderRadius.circular(9),
                ),
                alignment: Alignment.center,
                child: const Icon(
                  Icons.chevron_right,
                  size: 16,
                  color: _T.primaryLight,
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
                color: _T.primaryPale,
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Icon(Icons.person_off_outlined,
                  color: _T.primaryLight, size: 24),
            ),
            const SizedBox(height: 16),
            const Text(
              'No students linked yet',
              style: TextStyle(
                fontFamily: _T.fontDisplay,
                fontSize: 16,
                fontWeight: FontWeight.w500,
                color: _T.textPrimary,
              ),
            ),
            const SizedBox(height: 5),
            const Text(
              'Ask the school to link a student to your account.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12.5, color: _T.textMuted),
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
                color: _T.warningPale,
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Icon(Icons.search_off, color: _T.warning, size: 22),
            ),
            const SizedBox(height: 14),
            const Text(
              'No matches',
              style: TextStyle(
                fontFamily: _T.fontDisplay,
                fontSize: 15,
                fontWeight: FontWeight.w500,
                color: _T.textPrimary,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Try a different name, class, or school.',
              style: TextStyle(fontSize: 12.5, color: _T.textMuted),
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
              fontFamily: _T.fontMono,
              fontSize: 9,
              letterSpacing: 0.5,
              color: _T.textMuted.withOpacity(0.8),
            ),
          ),
          Text(
            'v1.4.1',
            style: TextStyle(
              fontFamily: _T.fontMono,
              fontSize: 9,
              letterSpacing: 0.5,
              color: _T.textMuted.withOpacity(0.8),
            ),
          ),
        ],
      ),
    );
  }
}