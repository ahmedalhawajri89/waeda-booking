<?php

namespace App\Services\Guard;

use App\Channels\MessageChannel;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\GuardMessage;
use App\Exceptions\BookingConflict;
use App\Models\Organization;
use App\Models\WaitlistEntry;
use App\Services\BookingWriter;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;
use App\Services\Subscription;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * The appointment guard, server side: planActions() and the backend half
 * (src/lib/guardEngine.js, src/lib/guardBackend.js) in one place.
 *
 * Run by the `guard:tick` schedule and on demand from the console. Every
 * outbound message the planner keys on is claimed by a unique `once_key`
 * before it is delivered, so two runs racing each other — the scheduler and
 * an operator opening the console in the same second — send it once.
 *
 * Bookings change only through BookingWriter, so a release takes the same
 * locks and leaves the same history as an operator cancelling by hand.
 */
class GuardEngine
{
    /** Messages the planner keys on — at most one of each per booking. */
    private const ONCE = ['reminder', 'confirm_request', 'deposit_request', 'release_notice'];

    /** How long an offer of times can still be answered with a number. */
    private const OFFER_OPEN_HOURS = 24;

    public function __construct(
        private BookingWriter $writer,
        private MessageChannel $channel,
        private ReplyUnderstanding $understanding,
        private SlotFinder $slots,
        private Backfill $backfill,
        private Subscription $subscription,
    ) {
    }

    /** Send what is due and release what has expired. Returns how many messages went out. */
    public function tick(string $org, ?CarbonInterface $now = null): int
    {
        $now ??= now();
        $tz = Organization::query()->whereKey($org)->value('timezone') ?? 'UTC';
        $policy = GuardPolicy::for($org);
        $templates = new MessageTemplates($tz, $now);

        $bookings = Booking::with(['events', 'customer', 'service'])->where('org_id', $org)->get();
        $model = new RiskModel($bookings, $tz, $now);

        $sent = GuardMessage::where('org_id', $org)->where('direction', 'out')
            ->whereIn('template', self::ONCE)
            ->get(['booking_id', 'template'])
            ->map(fn ($m) => "{$m->booking_id}:{$m->template}")
            ->flip();
        $confirmedByReply = GuardMessage::where('org_id', $org)->where('direction', 'in')
            ->where('intent', 'confirm')->pluck('booking_id')->flip();

        $has = fn (Booking $b, string $t) => $sent->has("{$b->id}:{$t}");
        $count = 0;

        foreach ($bookings as $b) {
            if (! in_array($b->status, Booking::BLOCKING, true) || $b->start_at->lte($now)) {
                continue;
            }

            $hoursLeft = ($b->start_at->getTimestamp() - $now->getTimestamp()) / 3600;
            $tier = $policy->tier($model->probability($b));
            $confirmed = $confirmedByReply->has($b->id) || $b->events->contains('type', 'customer_confirmed');
            $asked = $has($b, 'confirm_request');

            if ($policy->autoRelease && $asked && ! $confirmed && $hoursLeft <= $policy->releaseHoursBefore) {
                if ($this->releaseIfStillSilent($b)) {
                    $count += $this->send($b, 'release_notice', $templates, $now);
                }

                continue;
            }

            if ($tier !== 'low' && ! $confirmed && ! $asked && $hoursLeft <= $policy->confirmHoursBefore) {
                $count += $this->send($b, 'confirm_request', $templates, $now);

                continue;
            }

            if (! $asked && ! $has($b, 'reminder') && $hoursLeft <= $policy->remindHoursBefore) {
                $count += $this->send($b, 'reminder', $templates, $now);
            }

            if ($tier === 'high' && $policy->depositForHigh && $this->subscription->allows($org, 'deposits') && ! $confirmed && $b->payment_status === 'unpaid'
                && ! $has($b, 'deposit_request') && $hoursLeft <= $policy->remindHoursBefore) {
                $count += $this->send($b, 'deposit_request', $templates, $now);
            }
        }

        // A slot freed by a cancellation or a release is offered on — so a
        // no-show caught early becomes a booking instead of an empty hour.
        // Refilling is a paid feature: on the free plan a freed slot just stays free.
        $slots = $this->subscription->allows($org, 'refill') ? $this->backfill->freedSlots($bookings, $now) : [];
        foreach ($slots as $slot) {
            foreach ($this->backfill->candidates($slot, $bookings, $tz, $now) as $c) {
                $to = Customer::find($c['customerId']);
                $count += $this->send($slot, 'backfill_offer', $templates, $now,
                    onceKey: "{$slot->id}:backfill:{$to->id}",
                    extra: ['name' => $to->name],
                    payload: ['entryId' => $c['entryId'], 'reason' => $c['reason']],
                    to: $to);
            }
        }

        return $count;
    }

    /**
     * Releases a booking for silence — after checking again, under a lock on
     * its row, that it is still open and still unconfirmed. The run read every
     * booking before it started sending, and a "yes" or a staff change can
     * land while it sends; releasing on that first read would cancel a booking
     * the customer has just confirmed.
     */
    private function releaseIfStillSilent(Booking $b): bool
    {
        return DB::transaction(function () use ($b) {
            $fresh = Booking::with('events')->lockForUpdate()->find($b->id);
            if (! $fresh || ! in_array($fresh->status, Booking::BLOCKING, true)) {
                return false;
            }
            $confirmed = $fresh->events->contains('type', 'customer_confirmed')
                || GuardMessage::where('booking_id', $b->id)->where('direction', 'in')->where('intent', 'confirm')->exists();
            if ($confirmed) {
                return false;
            }
            $this->writer->update($fresh, ['status' => 'cancelled'], null, [
                'type' => 'released', 'summary' => 'حُرّر الموعد لعدم تأكيد الحضور',
            ]);

            return true;
        });
    }

    /**
     * A customer's reply: recorded, read, acted on, answered.
     *
     * @return array{intent: string, booking: Booking}
     */
    public function reply(Booking $b, string $text, ?CarbonInterface $now = null): array
    {
        $now ??= now();
        $b->loadMissing(['customer', 'service']);
        $tz = Organization::query()->whereKey($b->org_id)->value('timezone') ?? 'UTC';
        $local = Carbon::instance($now)->setTimezone($tz);

        $offer = $this->openOffer($b, $now);
        $offered = array_map(
            fn (string $at) => Carbon::parse($at)->setTimezone($tz)->format('Y-m-d H:i'),
            $offer?->payload['options'] ?? [],
        );
        $u = $this->understanding->understand($text, $local, [
            'offered' => $offered,
            'service' => $b->service?->name,
            'startAt' => $b->start_at->copy()->setTimezone($tz)->format('Y-m-d H:i'),
        ]);
        $intent = $u['intent'];
        $live = in_array($b->status, Booking::BLOCKING, true);
        $ack = 'ack_handoff';
        $offerOut = null;

        if ($intent === 'choose' && $live && $offer) {
            $target = Carbon::parse($offer->payload['options'][$u['option'] - 1]);
            $offer->update(['payload' => ['used' => true] + $offer->payload]);
            try {
                // Picking a time is answering: the customer is coming, at the
                // new time, so the guard must not release it for silence.
                $this->writer->record($b, 'customer_confirmed', 'اختار العميل موعده الجديد برسالة');
                // Under the resource lock: an offered time is not a held one.
                $this->writer->update($b, ['start_at' => $target]);
                // The customer moved it; the business has not seen the new time.
                $b->forceFill(['acknowledged_at' => null])->save();
                $ack = 'ack_rescheduled';
            } catch (BookingConflict) {
                $offerOut = $this->slots->find($b, ['day' => $target->copy()->setTimezone($tz)->format('Y-m-d')], $now);
                $offerOut['fallback'] = true;
                $ack = null;
            }
        } elseif ($intent === 'reschedule' && $live) {
            $offerOut = $this->slots->find($b, $u, $now);
            $ack = $offerOut['options'] ? null : 'no_slots';
        } else {
            DB::transaction(function () use ($b, $intent, $live, &$ack) {
                if ($intent === 'confirm' && $live) {
                    $this->writer->record($b, 'customer_confirmed', 'أكّد العميل حضوره برسالة');
                    if ($b->status === 'pending') {
                        $this->writer->update($b, ['status' => 'confirmed']);
                    }
                    $ack = 'ack_confirm';
                } elseif ($intent === 'cancel' && $live) {
                    $this->writer->update($b, ['status' => 'cancelled'], null, [
                        'type' => 'cancelled', 'summary' => 'ألغى العميل الحجز برسالة',
                    ]);
                    $ack = 'ack_cancel';
                } elseif ($intent === 'late' && $live) {
                    $this->writer->record($b, 'note_added', 'أبلغ العميل أنه سيتأخر');
                }
            });
        }

        // A person reads what the guard could not settle: replies it did not
        // understand, lateness, and a move with nowhere to go.
        GuardMessage::create([
            'org_id' => $b->org_id, 'booking_id' => $b->id, 'direction' => 'in', 'template' => 'reply',
            'body' => trim($text), 'intent' => $intent,
            'needs_staff' => in_array($ack, ['ack_handoff', 'no_slots'], true),
            'channel' => $this->channel->name(), 'sent_at' => $now,
        ]);

        $fresh = $b->fresh(['customer', 'service', 'events']);
        $templates = new MessageTemplates($tz, $now);
        if ($offerOut && $offerOut['options']) {
            $this->send($fresh, 'reschedule_offer', $templates, $now, once: false,
                extra: ['options' => $offerOut['options'], 'fallback' => $offerOut['fallback']],
                payload: [
                    'options' => array_map(fn (Carbon $c) => $c->toIso8601String(), $offerOut['options']),
                    // The time the offer was made against: once the booking
                    // moves some other way, a "1" no longer means one of these.
                    'from' => $fresh->start_at->toIso8601String(),
                ]);
        }
        if ($ack) {
            $this->send($fresh, $ack, $templates, $now, once: false);
        }

        return ['intent' => $intent, 'booking' => $fresh];
    }

    /**
     * The latest offer of times for this booking, while it can still be
     * answered: not used, recent, made against the booking's current time,
     * and with none of its times already past. Otherwise a "1" days later,
     * meant as "confirm", would move the booking to a stale time.
     */
    private function openOffer(Booking $b, CarbonInterface $now): ?GuardMessage
    {
        $offer = GuardMessage::where('booking_id', $b->id)->where('direction', 'out')
            ->where('template', 'reschedule_offer')->orderByDesc('sent_at')->first();

        if (! $offer || ! empty($offer->payload['used'])
            || $offer->sent_at->lt(Carbon::instance($now)->subHours(self::OFFER_OPEN_HOURS))) {
            return null;
        }
        $from = $offer->payload['from'] ?? null;
        if ($from && ! Carbon::parse($from)->equalTo($b->start_at)) {
            return null;
        }
        foreach ($offer->payload['options'] ?? [] as $at) {
            if (Carbon::parse($at)->lte($now)) {
                return null;
            }
        }

        return $offer;
    }

    /**
     * A candidate's answer to the offer of a freed slot. "Yes" books it for
     * them through BookingWriter — so if someone answered first, the overlap
     * check under the resource lock is what says no.
     *
     * @return array{intent: string, booking: ?Booking}
     */
    public function replyToOffer(GuardMessage $offer, string $text, ?CarbonInterface $now = null): array
    {
        $now ??= now();
        $freed = Booking::with(['service'])->findOrFail($offer->booking_id);
        $candidate = Customer::findOrFail($offer->customer_id);
        $tz = Organization::query()->whereKey($freed->org_id)->value('timezone') ?? 'UTC';
        $intent = $this->understanding->understand($text, Carbon::instance($now)->setTimezone($tz))['intent'];

        $created = null;
        $ack = $intent === 'cancel' ? 'backfill_declined' : 'ack_handoff';
        if ($intent === 'confirm') {
            if ($freed->start_at->lte($now)) {
                $ack = 'backfill_taken';
            } else {
                try {
                    $created = $this->writer->create([
                        'org_id' => $freed->org_id,
                        'customer_id' => $candidate->id,
                        'service_id' => $freed->service_id,
                        'resource_id' => $freed->resource_id,
                        'start_at' => $freed->start_at,
                        // The freed slot's own length: a 90-minute court is offered as one.
                        'duration_min' => $freed->duration_min,
                        'status' => 'confirmed',
                        'payment_status' => 'unpaid',
                        'channel' => 'online',
                    ]);
                    $this->writer->record($created, 'note_added', 'حُجز من موعد متفرّغ عبر مساعد الحضور');
                    if ($entry = $offer->payload['entryId'] ?? null) {
                        WaitlistEntry::whereKey($entry)->update(['status' => 'booked']);
                    }
                    $ack = 'backfill_won';
                } catch (BookingConflict) {
                    $ack = 'backfill_taken';
                }
            }
        }

        GuardMessage::create([
            'org_id' => $freed->org_id, 'booking_id' => $freed->id, 'customer_id' => $candidate->id,
            'reply_to' => $offer->id, 'direction' => 'in', 'template' => 'reply',
            'body' => trim($text), 'intent' => $intent, 'needs_staff' => $ack === 'ack_handoff',
            'channel' => $this->channel->name(), 'sent_at' => $now,
        ]);
        // On the freed booking's thread, addressed to the candidate; the time is
        // the same whether or not they got it.
        $this->send($freed, $ack, new MessageTemplates($tz, $now), $now,
            once: false,
            extra: ['name' => $candidate->name],
            payload: $created ? ['bookingId' => $created->id, 'priceMinor' => $created->price_minor] : null,
            to: $candidate);

        return ['intent' => $intent, 'booking' => $created?->fresh('events')];
    }

    /** @return Collection<int, GuardMessage> */
    /**
     * A person on the team writing to the customer, in the same thread and
     * through the same channel as the guard. Answering is what closes a
     * conversation the guard handed over, so this also clears the hand-off.
     */
    public function staffReply(Booking $booking, string $body, string $author): GuardMessage
    {
        // A person is waiting on this one, so say why it did not go.
        if (! $this->subscription->canSend($booking->org_id)) {
            throw new HttpResponseException(response()->json([
                'error' => 'message_quota',
                'message' => 'انتهت رسائل هذا الشهر في باقتك. أضف باقة رسائل أو رقِّ اشتراكك.',
            ], 422));
        }

        $message = GuardMessage::create([
            'id' => (string) Str::uuid(),
            'org_id' => $booking->org_id,
            'booking_id' => $booking->id,
            'direction' => 'out',
            'template' => 'staff',
            'body' => $body,
            'payload' => ['author' => $author],
            'channel' => $this->channel->name(),
            'sent_at' => now(),
        ]);
        $this->resolve($booking);

        try {
            $this->channel->send($booking->customer?->phone ?? '', $body);
        } catch (Throwable $e) {
            // Unlike the guard's own sends there is no next run to retry this:
            // the person who wrote it has to know it did not go.
            $message->delete();
            throw $e;
        }

        return $message;
    }

    /** Nothing left for the team in this conversation. */
    public function resolve(Booking $booking): void
    {
        GuardMessage::where('org_id', $booking->org_id)
            ->where('booking_id', $booking->id)
            ->where('needs_staff', true)
            ->update(['needs_staff' => false]);
    }

    public function messages(string $org): Collection
    {
        return GuardMessage::where('org_id', $org)->orderBy('sent_at')->get();
    }

    /**
     * Claim, then deliver. Claiming first is what makes concurrent runs safe;
     * if delivery fails the claim is withdrawn so the next run tries again.
     *
     * @return int 1 if this call sent it, 0 if another run already had
     */
    private function send(
        Booking $b,
        string $template,
        MessageTemplates $templates,
        CarbonInterface $now,
        bool $once = true,
        array $extra = [],
        ?array $payload = null,
        ?Customer $to = null,
        ?string $onceKey = null,
    ): int {
        // Out of messages: the guard goes quiet, bookings carry on.
        if (! $this->subscription->canSend($b->org_id)) {
            return 0;
        }

        $id = (string) Str::uuid();
        $claimed = DB::table('guard_messages')->insertOrIgnore([
            'id' => $id,
            'org_id' => $b->org_id,
            'booking_id' => $b->id,
            'direction' => 'out',
            'template' => $template,
            'body' => $templates->render($template, $b, $extra),
            'payload' => $payload ? json_encode($payload) : null,
            'needs_staff' => false,
            'channel' => $this->channel->name(),
            'sent_at' => $now,
            'once_key' => $onceKey ?? ($once ? "{$b->id}:{$template}" : null),
            'customer_id' => $to?->id,
        ]);
        if (! $claimed) {
            return 0;
        }

        try {
            $this->channel->send(($to ?? $b->customer)?->phone ?? '', GuardMessage::find($id)->body);
        } catch (Throwable $e) {
            GuardMessage::whereKey($id)->delete();
            report($e);

            return 0;
        }

        return 1;
    }
}
