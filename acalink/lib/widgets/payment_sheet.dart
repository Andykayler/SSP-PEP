import 'package:flutter/material.dart';
import '../models/student.dart';
import '../theme/app_theme.dart';
import '../services/fees_service.dart';

/// ─── Payment sheet ─────────────────────────────────────────────────────
/// Bottom sheet for taking a payment against an outstanding balance.
/// Writes straight to the same `payments` collection the bursar console
/// reads, in the same shape, so it shows up there immediately. Returns
/// the completed [PaymentRecord] via `Navigator.pop` on success, or
/// `null` if dismissed.
///
/// Usage:
/// ```dart
/// final result = await showModalBottomSheet<PaymentRecord>(
///   context: context,
///   isScrollControlled: true,
///   backgroundColor: Colors.transparent,
///   builder: (_) => PaymentSheet(
///     student: widget.student!,
///     outstandingBalance: balance,
///     recordedBy: guardianName,
///     service: feesService,
///   ),
/// );
/// ```
class PaymentSheet extends StatefulWidget {
  final Student student;
  final int outstandingBalance;
  final String recordedBy;
  final FeesService service;
  const PaymentSheet({
    super.key,
    required this.student,
    required this.outstandingBalance,
    required this.recordedBy,
    required this.service,
  });

  @override
  State<PaymentSheet> createState() => _PaymentSheetState();
}

const _payMethodIcons = {
  PayMethod.airtelMoney: Icons.phone_iphone_rounded,
  PayMethod.tnmMpamba: Icons.phone_android_rounded,
  PayMethod.bankTransfer: Icons.account_balance_rounded,
  PayMethod.school: Icons.storefront_rounded,
};

enum _SheetStage { form, submitting, success }

class _PaymentSheetState extends State<PaymentSheet> {
  late final TextEditingController _amountCtrl;
  final _phoneCtrl = TextEditingController();
  final _referenceCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  PayMethod _method = PayMethod.airtelMoney;
  late String _term;
  _SheetStage _stage = _SheetStage.form;
  String? _error;
  late PaymentRecord _completed;

  @override
  void initState() {
    super.initState();
    _amountCtrl = TextEditingController(text: widget.outstandingBalance.toString());
    _term = widget.service.availableTerms.first;
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _phoneCtrl.dispose();
    _referenceCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  PayMethodOption get _selected =>
      payMethods.firstWhere((m) => m.method == _method);

  Future<void> _submit() async {
    final amount = int.tryParse(_amountCtrl.text.trim());
    if (amount == null || amount <= 0) {
      setState(() => _error = 'Enter a valid amount');
      return;
    }
    if (amount > widget.outstandingBalance) {
      setState(() => _error = 'Amount exceeds the outstanding balance');
      return;
    }
    if (_selected.needsPhone && _phoneCtrl.text.trim().length < 9) {
      setState(() => _error = 'Enter a valid mobile money number');
      return;
    }

    setState(() {
      _error = null;
      _stage = _SheetStage.submitting;
    });

    try {
      // For mobile money, fall back to the phone number as the reference
      // if the payer didn't separately provide a transaction reference.
      final reference = _referenceCtrl.text.trim().isNotEmpty
          ? _referenceCtrl.text.trim()
          : (_selected.needsPhone ? _phoneCtrl.text.trim() : '');

      final record = await widget.service.submitPayment(
        student: widget.student,
        method: _method,
        amount: amount,
        term: _term,
        recordedBy: widget.recordedBy,
        referenceNo: reference,
        notes: _notesCtrl.text.trim(),
      );
      _completed = record;
      if (!mounted) return;
      setState(() => _stage = _SheetStage.success);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Payment failed to save — please try again';
        _stage = _SheetStage.form;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: AppTheme.bg,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        child: SafeArea(
          top: false,
          child: switch (_stage) {
            _SheetStage.success => _SuccessView(payment: _completed),
            _SheetStage.submitting => const _SubmittingView(),
            _SheetStage.form => _buildForm(),
          },
        ),
      ),
    );
  }

  Widget _buildForm() {
    return SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: AppTheme.borderStrong,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const Text(
            'Make a Payment',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: AppTheme.textPrimary),
          ),
          const SizedBox(height: 2),
          Text(
            'Outstanding balance: ${formatCurrency(widget.outstandingBalance)}',
            style: const TextStyle(fontSize: 12.5, color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 20),

          const Text('AMOUNT (MWK)',
              style: TextStyle(
                  fontFamily: AppTheme.fontMono,
                  fontSize: 9,
                  letterSpacing: 1.6,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textMuted)),
          const SizedBox(height: 6),
          _field(
            controller: _amountCtrl,
            keyboardType: TextInputType.number,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppTheme.textPrimary),
          ),
          const SizedBox(height: 18),

          const Text('TERM',
              style: TextStyle(
                  fontFamily: AppTheme.fontMono,
                  fontSize: 9,
                  letterSpacing: 1.6,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textMuted)),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: AppTheme.cardBg,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.border),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _term,
                isExpanded: true,
                items: [
                  for (final t in widget.service.availableTerms)
                    DropdownMenuItem(value: t, child: Text(t, style: const TextStyle(fontSize: 14))),
                ],
                onChanged: (v) => setState(() => _term = v ?? _term),
              ),
            ),
          ),
          const SizedBox(height: 18),

          const Text('PAYMENT METHOD',
              style: TextStyle(
                  fontFamily: AppTheme.fontMono,
                  fontSize: 9,
                  letterSpacing: 1.6,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textMuted)),
          const SizedBox(height: 8),
          ...payMethods.map((m) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _MethodTile(
                  option: m,
                  selected: _method == m.method,
                  onTap: () => setState(() => _method = m.method),
                ),
              )),

          if (_selected.needsPhone) ...[
            const SizedBox(height: 4),
            const Text('MOBILE MONEY NUMBER',
                style: TextStyle(
                    fontFamily: AppTheme.fontMono,
                    fontSize: 9,
                    letterSpacing: 1.6,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textMuted)),
            const SizedBox(height: 6),
            _field(controller: _phoneCtrl, keyboardType: TextInputType.phone, hintText: '099X XXX XXX'),
          ],

          const SizedBox(height: 18),
          const Text('REFERENCE / TRANSACTION NO. (OPTIONAL)',
              style: TextStyle(
                  fontFamily: AppTheme.fontMono,
                  fontSize: 9,
                  letterSpacing: 1.6,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textMuted)),
          const SizedBox(height: 6),
          _field(controller: _referenceCtrl, hintText: 'Leave blank to auto-fill from phone number'),

          const SizedBox(height: 18),
          const Text('NOTES (OPTIONAL)',
              style: TextStyle(
                  fontFamily: AppTheme.fontMono,
                  fontSize: 9,
                  letterSpacing: 1.6,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textMuted)),
          const SizedBox(height: 6),
          _field(controller: _notesCtrl, maxLines: 2),

          if (_error != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.error_outline_rounded, size: 15, color: AppTheme.danger),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(_error!,
                      style: const TextStyle(fontSize: 12, color: AppTheme.danger)),
                ),
              ],
            ),
          ],

          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.navyStart,
                foregroundColor: Colors.white,
                elevation: 0,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              child: const Text('Confirm Payment',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _field({
    required TextEditingController controller,
    TextInputType? keyboardType,
    TextStyle? style,
    String? hintText,
    int maxLines = 1,
  }) {
    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      maxLines: maxLines,
      style: style ?? const TextStyle(fontSize: 14, color: AppTheme.textPrimary),
      decoration: InputDecoration(
        hintText: hintText,
        filled: true,
        fillColor: AppTheme.cardBg,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppTheme.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppTheme.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppTheme.primary, width: 1.4),
        ),
      ),
    );
  }
}

class _MethodTile extends StatelessWidget {
  final PayMethodOption option;
  final bool selected;
  final VoidCallback onTap;

  const _MethodTile({required this.option, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          decoration: BoxDecoration(
            color: selected ? AppTheme.primaryPale : AppTheme.cardBg,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: selected ? AppTheme.primary : AppTheme.border, width: selected ? 1.3 : 1),
          ),
          child: Row(
            children: [
              Icon(_payMethodIcons[option.method], size: 17, color: selected ? AppTheme.primaryLight : AppTheme.textSecondary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  option.label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: selected ? AppTheme.primaryLight : AppTheme.textPrimary,
                  ),
                ),
              ),
              Icon(
                selected ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
                size: 18,
                color: selected ? AppTheme.primary : AppTheme.textMuted,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SubmittingView extends StatelessWidget {
  const _SubmittingView();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 48),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 28,
            height: 28,
            child: CircularProgressIndicator(strokeWidth: 2.6, color: AppTheme.primary),
          ),
          SizedBox(height: 16),
          Text('Processing payment…',
              style: TextStyle(fontSize: 13.5, color: AppTheme.textSecondary)),
        ],
      ),
    );
  }
}

class _SuccessView extends StatelessWidget {
  final PaymentRecord payment;
  const _SuccessView({required this.payment});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 8),
        Container(
          width: 56,
          height: 56,
          decoration: const BoxDecoration(color: AppTheme.successPale, shape: BoxShape.circle),
          alignment: Alignment.center,
          child: const Icon(Icons.check_rounded, size: 28, color: AppTheme.success),
        ),
        const SizedBox(height: 16),
        const Text('Payment Received',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
        const SizedBox(height: 4),
        Text(formatCurrency(payment.amount),
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
        const SizedBox(height: 4),
        Text('${payment.method} · Receipt ${payment.receiptNo}',
            style: const TextStyle(fontSize: 12, color: AppTheme.textMuted)),
        const SizedBox(height: 22),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: () => Navigator.of(context).pop(payment),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.navyStart,
              foregroundColor: Colors.white,
              elevation: 0,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            child: const Text('Done', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          ),
        ),
      ],
    );
  }
}