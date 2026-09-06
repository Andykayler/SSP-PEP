import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/student.dart';

/// ─── ASSUMPTIONS ABOUT Student ────────────────────────────────────────
/// This service reads the following off [Student] to match the bursar's
/// `payments` schema (pages/bursar/modules/Payments.jsx):
///   id, fullName, studentCode, classId, className, schoolCode
/// If your Student model uses different names, only `_ctx()` below needs
/// to change — everything else reads from the returned map.
Map<String, dynamic> _ctx(Student s) => {
      'studentId': s.id,
      'studentName': s.fullName,
      'studentCode': s.studentCode,
      'classId': s.classId,
      'className': s.className,
      'schoolCode': s.schoolCode,
    };

// Kept as a fixed constant (matching the bursar console's default filter)
// rather than read off Student, so a read always lines up with what was
// just written — no dependency on a Student.academicYear field we can't
// verify. Bump this when the school year rolls over, or wire it to a
// real source once confirmed.
const _academicYear = "2025/2026"; // TODO: make dynamic / from provider

/// The same value, exported so anything watching these collections filters
/// on the year the fetch filters on. A listener that disagreed would either
/// be refused outright — a list is authorised from its own constraints — or
/// simply never fire, which is worse because it looks like nothing changed.
const feesAcademicYear = _academicYear;

/// ─── Domain models (aligned with Firebase schema from bursar view) ───────
enum FeeStatus { paid, partial, unpaid }

class FeeLine {
  final String id;
  final String name;
  final String category;
  final int charged;
  final int paid;
  final String term;

  const FeeLine({
    required this.id,
    required this.name,
    required this.category,
    required this.charged,
    this.paid = 0,
    this.term = '',
  });

  int get balance => charged - paid;
  FeeStatus get status {
    if (balance <= 0) return FeeStatus.paid;
    if (paid > 0) return FeeStatus.partial;
    return FeeStatus.unpaid;
  }

  FeeLine copyWith({int? paid}) => FeeLine(
        id: id,
        name: name,
        category: category,
        charged: charged,
        paid: paid ?? this.paid,
        term: term,
      );
}

class PaymentRecord {
  final String id;
  final String method;
  final int amount;
  final String date;
  final String reference;
  final String receiptNo;
  const PaymentRecord({
    required this.id,
    required this.method,
    required this.amount,
    required this.date,
    required this.reference,
    this.receiptNo = '',
  });
}

/// Result of a fee fetch — kept as one object so the screen does one
/// setState instead of juggling two separate lists mid-load.
class FeesData {
  final List<FeeLine> lines;
  final List<PaymentRecord> payments;
  const FeesData({required this.lines, required this.payments});

  int get totalCharged => lines.fold(0, (s, l) => s + l.charged);
  int get totalPaid => lines.fold(0, (s, l) => s + l.paid);
  int get balance => totalCharged - totalPaid;
  double get percentPaid => totalCharged == 0 ? 0 : totalPaid / totalCharged;
}

// NOTE: currency prefix changed from 'MK' to 'MWK' to match fmt() in the
// bursar console (Payments.jsx / FeeStructure.jsx) — same currency, same
// label, so amounts read identically in both places.
String formatCurrency(int n) => 'MWK ${n.toString().replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
      (m) => '${m[1]},',
    )}';

String _today() {
  final d = DateTime.now();
  return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

/// Mirrors genReceiptNo() in Payments.jsx (`RCP-<base36 ms>-<3 digits>`)
/// so receipts look the same whether issued from the bursar console or
/// the app.
String _genReceiptNo() {
  final base36 = DateTime.now().millisecondsSinceEpoch.toRadixString(36).toUpperCase();
  final suffix = 100 + DateTime.now().microsecond % 900;
  return 'RCP-$base36-$suffix';
}

/// ─── Payment methods ──────────────────────────────────────────────────
/// [firestoreValue] is what gets written to `payments.method` — it must
/// match one of PAYMENT_METHODS in Payments.jsx so the bursar's method
/// filter and badge coloring pick it up correctly. [label] is what the
/// app displays, which can be more descriptive/localized.
enum PayMethod { airtelMoney, tnmMpamba, bankTransfer, school }

class PayMethodOption {
  final PayMethod method;
  final String label;
  final String firestoreValue;
  final bool needsPhone;
  const PayMethodOption(this.method, this.label, this.firestoreValue, this.needsPhone);
}

const payMethods = [
  PayMethodOption(PayMethod.airtelMoney, 'Airtel Money', 'Airtel Money', true),
  PayMethodOption(PayMethod.tnmMpamba, 'TNM Mpamba', 'TNM Mpamba', true),
  // Kept generic per product decision — the web splits this into
  // National/Standard/NBS Transfer, the app does not.
  PayMethodOption(PayMethod.bankTransfer, 'Bank Transfer', 'Bank Transfer', false),
  PayMethodOption(PayMethod.school, 'Pay at School (Cash)', 'Cash', false),
];

const _terms = ['Term 1', 'Term 2', 'Term 3', 'Full Year'];

class FeesService {
  final FirebaseFirestore _firestore;
  FeesService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  List<String> get availableTerms => _terms;

  /// Fetches fee assignments + payments for a student, scoped by
  /// studentId + academicYear the same way the original working query
  /// was. The bursar's own balance math is just totalCharged − totalPaid with no
  /// per-line linkage, so that's matched here too — the running total is
  /// distributed across lines oldest-first purely for the on-screen
  /// breakdown, never written back to Firestore.
  Future<FeesData> fetchStudentFees(Student student) async {
    final ctx = _ctx(student);
    final studentId = ctx['studentId'] as String;

    final feeSnap = await _firestore
        .collection('fee_assignments')
        .where('studentId', isEqualTo: studentId)
        .where('academicYear', isEqualTo: _academicYear)
        .get();

    final paySnap = await _firestore
        .collection('payments')
        .where('studentId', isEqualTo: studentId)
        .where('academicYear', isEqualTo: _academicYear)
        .orderBy('createdAt', descending: true)
        .get();

    final lines = feeSnap.docs.map((doc) {
      final data = doc.data();
      return FeeLine(
        id: doc.id,
        name: data['feeName'] ?? 'Unknown Fee',
        category: data['category'] ?? '',
        charged: (data['amount'] as num?)?.toInt() ?? 0,
        term: data['term'] ?? '',
      );
    }).toList();

    final totalPaid = paySnap.docs
        .fold<int>(0, (s, doc) => s + ((doc.data()['amount'] as num?)?.toInt() ?? 0));

    final payments = paySnap.docs.map((doc) {
      final data = doc.data();
      return PaymentRecord(
        id: doc.id,
        method: data['method'] ?? 'Unknown',
        amount: (data['amount'] as num?)?.toInt() ?? 0,
        date: data['paymentDate'] ?? _formatTimestamp(data['createdAt']),
        reference: data['referenceNo'] ?? '',
        receiptNo: data['receiptNo'] ?? '',
      );
    }).toList();

    return FeesData(lines: applyPayment(lines, totalPaid), payments: payments);
  }

  static String _formatTimestamp(dynamic timestamp) {
    if (timestamp is Timestamp) {
      final dt = timestamp.toDate();
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return "${dt.day} ${months[dt.month - 1]} ${dt.year}";
    }
    return "Just now";
  }

  /// Writes a payment doc in exactly the shape Payments.jsx writes it, so
  /// it shows up in the bursar's table, stats, and receipt flow with no
  /// extra handling on their side.
  Future<PaymentRecord> submitPayment({
    required Student student,
    required PayMethod method,
    required int amount,
    required String term,
    required String recordedBy,
    String referenceNo = '',
    String notes = '',
  }) async {
    final ctx = _ctx(student);
    final option = payMethods.firstWhere((m) => m.method == method);
    final receiptNo = _genReceiptNo();

    await _firestore.collection('payments').add({
      'studentId': ctx['studentId'],
      'studentName': ctx['studentName'],
      'studentCode': ctx['studentCode'],
      'classId': ctx['classId'],
      'className': ctx['className'],
      'amount': amount,
      'method': option.firestoreValue,
      'referenceNo': referenceNo.trim(),
      'term': term,
      'notes': notes.trim(),
      'paymentDate': _today(),
      'receiptNo': receiptNo,
      'recordedBy': recordedBy,
      'academicYear': _academicYear,
      'schoolCode': ctx['schoolCode'],
      // A payment entered here is the parent's own claim — nothing has checked
      // that the money arrived. These two fields are required by the Firestore
      // rule for anonymous writes so the bursar's ledger can always tell a
      // self-reported payment from one the bursar recorded. Do not drop them:
      // the write is refused without them.
      'source': 'parent_app',
      'status': 'unverified',
      'createdAt': FieldValue.serverTimestamp(),
    });

    return PaymentRecord(
      id: receiptNo,
      method: option.firestoreValue,
      amount: amount,
      date: 'Just now',
      reference: referenceNo,
      receiptNo: receiptNo,
    );
  }

  /// Distributes a payment amount across fee lines in order, oldest
  /// balance first, until the amount is exhausted. Pure function, reused
  /// both for the freshly-fetched running total (lines start at paid: 0)
  /// and for local optimistic updates on top of an already-loaded list.
  List<FeeLine> applyPayment(List<FeeLine> lines, int amount) {
    var remaining = amount;
    return [
      for (final l in lines)
        if (l.balance <= 0 || remaining <= 0)
          l
        else
          () {
            final applied = remaining < l.balance ? remaining : l.balance;
            remaining -= applied;
            return l.copyWith(paid: l.paid + applied);
          }(),
    ];
  }
}