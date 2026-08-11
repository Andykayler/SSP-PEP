import 'package:flutter/material.dart';
import '../models/student.dart';
import '../theme/app_theme.dart';
import '../services/fees_service.dart';
import '../widgets/payment_sheet.dart';

/// ─── Screen ────────────────────────────────────────────────────────────
class FeesScreen extends StatefulWidget {
  final Student? student;
  /// Shown as `recordedBy` on the payment doc — matches what the bursar
  /// console shows in its "Recorded by" / receipt fields. Pass the
  /// signed-in parent/guardian's name.
  final String guardianName;
  const FeesScreen({super.key, this.student, required this.guardianName});

  @override
  State<FeesScreen> createState() => _FeesScreenState();
}

class _FeesScreenState extends State<FeesScreen> {
  final _service = FeesService();

  List<FeeLine> _lines = [];
  List<PaymentRecord> _payments = [];
  bool _loading = true;
  String? _error;

  int get _totalCharged => _lines.fold(0, (s, l) => s + l.charged);
  int get _totalPaid => _lines.fold(0, (s, l) => s + l.paid);
  int get _balance => _totalCharged - _totalPaid;
  double get _percentPaid =>
      _totalCharged == 0 ? 0 : _totalPaid / _totalCharged;

  @override
  void initState() {
    super.initState();
    _loadFees();
  }

  Future<void> _loadFees() async {
    final student = widget.student;
    if (student == null) {
      setState(() {
        _loading = false;
        _error = "No student selected";
      });
      return;
    }

    try {
      final data = await _service.fetchStudentFees(student);
      if (!mounted) return;
      setState(() {
        _lines = data.lines;
        _payments = data.payments;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = "Failed to load fees: $e";
      });
    }
  }

  Future<void> _openPaymentSheet() async {
    final student = widget.student;
    if (student == null) return;

    final result = await showModalBottomSheet<PaymentRecord>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => PaymentSheet(
        student: student,
        outstandingBalance: _balance,
        recordedBy: widget.guardianName,
        service: _service,
      ),
    );

    if (result != null && mounted) {
      // Optimistic update; service owns the distribution logic.
      setState(() {
        _payments.insert(0, result);
        _lines = _service.applyPayment(_lines, result.amount);
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppTheme.success,
          content: Text(
            'Payment of ${formatCurrency(result.amount)} received · Ref ${result.reference}',
            style: const TextStyle(fontSize: 13),
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = widget.student?.fullName ?? 'Student';

    if (_loading) {
      return Scaffold(
        backgroundColor: AppTheme.bg,
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_error != null) {
      return Scaffold(
        backgroundColor: AppTheme.bg,
        body: Center(child: Text(_error!, style: const TextStyle(color: Colors.red))),
      );
    }

    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(child: _FeesHeader(studentName: name)),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
              sliver: SliverToBoxAdapter(
                child: _BalanceCard(
                  totalCharged: _totalCharged,
                  totalPaid: _totalPaid,
                  balance: _balance,
                  percent: _percentPaid,
                  onPay: _balance > 0 ? _openPaymentSheet : null,
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
              sliver: SliverToBoxAdapter(
                child: _FeeBreakdownCard(lines: _lines),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              sliver: SliverToBoxAdapter(
                child: _PaymentHistoryCard(payments: _payments),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// ─── Header ────────────────────────────────────────────────────────────
class _FeesHeader extends StatelessWidget {
  final String studentName;
  const _FeesHeader({required this.studentName});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 20, 4),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.arrow_back_rounded, color: AppTheme.textPrimary),
          ),
          const SizedBox(width: 2),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'FEES',
                  style: TextStyle(
                    fontFamily: AppTheme.fontMono,
                    fontSize: 9,
                    letterSpacing: 2.4,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textMuted,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  studentName,
                  style: const TextStyle(
                    fontFamily: AppTheme.fontDisplay,
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// ─── Balance summary + pay CTA ────────────────────────────────────────
class _BalanceCard extends StatelessWidget {
  final int totalCharged;
  final int totalPaid;
  final int balance;
  final double percent;
  final VoidCallback? onPay;

  const _BalanceCard({
    required this.totalCharged,
    required this.totalPaid,
    required this.balance,
    required this.percent,
    required this.onPay,
  });

  @override
  Widget build(BuildContext context) {
    final settled = balance <= 0;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppTheme.navyStart, AppTheme.navyEnd],
        ),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                settled ? 'FULLY SETTLED' : 'OUTSTANDING BALANCE',
                style: TextStyle(
                  fontFamily: AppTheme.fontMono,
                  fontSize: 9,
                  letterSpacing: 2,
                  fontWeight: FontWeight.w600,
                  color: Colors.white.withOpacity(0.65),
                ),
              ),
              if (!settled)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(7),
                  ),
                  child: const Text(
                    'DUE 5 AUG 2026',
                    style: TextStyle(
                      fontFamily: AppTheme.fontMono,
                      fontSize: 8.5,
                      letterSpacing: 0.6,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            settled ? formatCurrency(0) : formatCurrency(balance),
            style: const TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w700,
              color: Colors.white,
              height: 1.1,
            ),
          ),
          const SizedBox(height: 16),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: percent.clamp(0, 1),
              minHeight: 6,
              backgroundColor: Colors.white.withOpacity(0.15),
              valueColor: AlwaysStoppedAnimation(
                settled ? AppTheme.success : Colors.white,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '${formatCurrency(totalPaid)} paid of ${formatCurrency(totalCharged)} · ${(percent * 100).round()}%',
            style: TextStyle(fontSize: 12, color: Colors.white.withOpacity(0.8)),
          ),
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: onPay,
              style: ElevatedButton.styleFrom(
                backgroundColor: settled ? Colors.white.withOpacity(0.12) : Colors.white,
                foregroundColor: settled ? Colors.white.withOpacity(0.6) : AppTheme.navyStart,
                elevation: 0,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              icon: Icon(settled ? Icons.check_circle_rounded : Icons.payments_rounded,
                  size: 18),
              label: Text(
                settled ? 'No balance due' : 'Make a Payment',
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// ─── Fee breakdown ─────────────────────────────────────────────────────
class _FeeBreakdownCard extends StatelessWidget {
  final List<FeeLine> lines;
  const _FeeBreakdownCard({required this.lines});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(bottom: 10, left: 2),
          child: Text(
            'Fee Breakdown',
            style: TextStyle(
              fontFamily: AppTheme.fontDisplay,
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppTheme.textPrimary,
            ),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: AppTheme.cardBg,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppTheme.border),
          ),
          child: Column(
            children: [
              for (int i = 0; i < lines.length; i++) ...[
                _FeeLineRow(line: lines[i]),
                if (i != lines.length - 1)
                  const Divider(height: 1, color: AppTheme.border, indent: 16, endIndent: 16),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _StatusStyle {
  final Color color;
  final Color bg;
  final String label;
  const _StatusStyle(this.color, this.bg, this.label);
}

const _statusStyles = {
  FeeStatus.paid: _StatusStyle(AppTheme.success, AppTheme.successPale, 'PAID'),
  FeeStatus.partial: _StatusStyle(AppTheme.warning, AppTheme.warningPale, 'PARTIAL'),
  FeeStatus.unpaid: _StatusStyle(AppTheme.danger, AppTheme.dangerPale, 'UNPAID'),
};

class _FeeLineRow extends StatelessWidget {
  final FeeLine line;
  const _FeeLineRow({required this.line});

  @override
  Widget build(BuildContext context) {
    final style = _statusStyles[line.status]!;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(line.name,
                    style: const TextStyle(
                        fontSize: 13.5, fontWeight: FontWeight.w500, color: AppTheme.textPrimary)),
                const SizedBox(height: 2),
                Text(
                  line.balance > 0
                      ? '${formatCurrency(line.paid)} of ${formatCurrency(line.charged)} paid'
                      : '${formatCurrency(line.charged)} settled',
                  style: const TextStyle(fontSize: 11.5, color: AppTheme.textMuted),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
            decoration:
                BoxDecoration(color: style.bg, borderRadius: BorderRadius.circular(7)),
            child: Text(
              style.label,
              style: TextStyle(
                fontFamily: AppTheme.fontMono,
                fontSize: 8.5,
                letterSpacing: 0.6,
                fontWeight: FontWeight.w700,
                color: style.color,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// ─── Payment history ───────────────────────────────────────────────────
class _PaymentHistoryCard extends StatelessWidget {
  final List<PaymentRecord> payments;
  const _PaymentHistoryCard({required this.payments});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(bottom: 10, left: 2),
          child: Text(
            'Payment History',
            style: TextStyle(
              fontFamily: AppTheme.fontDisplay,
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppTheme.textPrimary,
            ),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: AppTheme.cardBg,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppTheme.border),
          ),
          child: payments.isEmpty
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: 28),
                  child: Center(
                    child: Text('No payments recorded yet',
                        style: TextStyle(fontSize: 12.5, color: AppTheme.textMuted)),
                  ),
                )
              : Column(
                  children: [
                    for (int i = 0; i < payments.length; i++) ...[
                      _PaymentRow(payment: payments[i]),
                      if (i != payments.length - 1)
                        const Divider(height: 1, color: AppTheme.border, indent: 16, endIndent: 16),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

class _PaymentRow extends StatelessWidget {
  final PaymentRecord payment;
  const _PaymentRow({required this.payment});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
                color: AppTheme.successPale, borderRadius: BorderRadius.circular(10)),
            alignment: Alignment.center,
            child: const Icon(Icons.check_rounded, size: 16, color: AppTheme.success),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(payment.method,
                    style: const TextStyle(
                        fontSize: 13.5, fontWeight: FontWeight.w500, color: AppTheme.textPrimary)),
                const SizedBox(height: 2),
                Text('${payment.date} · Ref ${payment.reference}',
                    style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
              ],
            ),
          ),
          Text(formatCurrency(payment.amount),
              style: const TextStyle(
                  fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.success)),
        ],
      ),
    );
  }
}