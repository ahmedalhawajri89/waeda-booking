<?php

namespace App\Services\Guard;

use App\Models\Booking;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * The guard's messages in Arabic — render() in src/lib/guardEngine.js, word
 * for word, so a booking reads the same whichever backend sent it.
 *
 * Times are in the organization's zone with Latin digits and ص/م, matching
 * format.js on the client.
 */
class MessageTemplates
{
    public const LABELS = [
        'reminder', 'confirm_request', 'deposit_request', 'release_notice',
        'ack_confirm', 'ack_cancel', 'ack_handoff', 'reschedule_offer', 'ack_rescheduled', 'no_slots',
    ];

    /** Every message about a booking ends the same way, so a reply is one key. */
    private const REPLY_MENU = 'للتأكيد أرسل 1، ولموعد آخر 3، وللإلغاء 2.';

    public function __construct(private string $tz, private CarbonInterface $now)
    {
    }

    /** @param array{options?: list<CarbonInterface>, fallback?: bool} $extra */
    public function render(string $template, Booking $b, array $extra = []): string
    {
        $first = explode(' ', trim($extra['name'] ?? $b->customer?->name ?? 'عميلنا'))[0];
        $service = $b->service?->name ?? 'الخدمة';
        $when = $this->relativeDay($b->start_at).' الساعة '.$this->time($b->start_at);

        return match ($template) {
            'reminder' => "مرحباً {$first}، نذكّرك بموعد {$service} {$when}.\n".self::REPLY_MENU,
            'confirm_request' => "مرحباً {$first}، موعدك {$service} {$when}.\n".self::REPLY_MENU,
            'deposit_request' => 'لتثبيت موعدك '.$this->dayLabel($b->start_at).' نرجو دفع عربون '.$this->money(self::deposit($b->price_minor)).' — سيرسل لك فريقنا رابط الدفع.',
            'release_notice' => 'لم يصلنا تأكيدك، فأُتيح موعد '.$this->time($b->start_at).' لعميل آخر. يسعدنا حجز موعد جديد لك في أي وقت.',
            'ack_confirm' => "تم تأكيد موعدك، نراك {$when} ✅",
            'ack_cancel' => 'تم إلغاء موعدك. نتمنى رؤيتك قريباً.',
            'ack_handoff' => 'شكراً لك، سيتواصل معك أحد فريقنا قريباً.',
            'reschedule_offer' => implode("\n", [
                ($extra['fallback'] ?? false)
                    ? 'لا يوجد وقت متاح في الموعد الذي طلبته، وهذه أقرب الأوقات المتاحة:'
                    : 'هذه أقرب الأوقات المتاحة:',
                ...array_map(
                    fn (CarbonInterface $at, int $i) => ($i + 1).') '.$this->relativeDay($at).' '.$this->time($at),
                    $extra['options'] ?? [],
                    array_keys($extra['options'] ?? []),
                ),
                'أرسل رقم الوقت المناسب.',
            ]),
            'ack_rescheduled' => "تم نقل موعدك إلى {$when} ✅",
            'backfill_offer' => "مرحباً {$first}، تفرّغ موعد {$service} {$when}.\nلحجزه أرسل 1 — أول من يرد يأخذه.",
            'backfill_won' => "تم حجز الموعد لك ✅ نراك {$when}.",
            'backfill_taken' => 'عذراً، سبقك أحد إلى هذا الموعد. سنخبرك بالمواعيد القادمة.',
            'backfill_declined' => 'حسناً، سنخبرك بالمواعيد القادمة.',
            'no_slots' => 'لا يوجد وقت متاح قريباً لهذه الخدمة، وسيتواصل معك فريقنا لترتيب موعد.',
        };
    }

    /** A third of the price, in whole riyals — depositFor() on the client. */
    public static function deposit(int $priceMinor): int
    {
        return (int) round($priceMinor / 3 / 100) * 100;
    }

    private function local(CarbonInterface $at): Carbon
    {
        return Carbon::instance($at)->setTimezone($this->tz)->locale('ar');
    }

    private function time(CarbonInterface $at): string
    {
        $l = $this->local($at);

        return $l->format('g:i').' '.($l->format('A') === 'AM' ? 'ص' : 'م');
    }

    private function dayLabel(CarbonInterface $at): string
    {
        $l = $this->local($at);

        return $l->translatedFormat('l').' '.$l->format('j').' '.$l->translatedFormat('F');
    }

    private function relativeDay(CarbonInterface $at): string
    {
        $l = $this->local($at);
        $today = $this->local($this->now)->startOfDay();

        if ($l->isSameDay($today)) {
            return 'اليوم';
        }
        if ($l->isSameDay($today->copy()->addDay())) {
            return 'غداً';
        }

        return $this->dayLabel($at);
    }

    private function money(int $minor): string
    {
        return number_format($minor / 100).' ر.س.';
    }
}
