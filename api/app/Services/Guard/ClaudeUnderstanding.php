<?php

namespace App\Services\Guard;

use Anthropic\Client;
use Carbon\CarbonInterface;
use Throwable;

/**
 * Reading a reply with Claude — for everything the word lists cannot: dialect,
 * spelling, "بعد صلاة المغرب", "مو هالأسبوع خليها اللي بعده", two requests in
 * one message.
 *
 * Bound only when ANTHROPIC_API_KEY is set (see AppServiceProvider). It never
 * makes the guard depend on it: any failure — network, refusal, an answer
 * that does not fit the schema — and the reply is read by the rules instead.
 *
 * What it sends is the reply, today's date, the booking's service and time,
 * and the times an open offer listed. Never the customer's name or phone: the
 * model needs neither to read "خليها بكرة".
 */
class ClaudeUnderstanding implements ReplyUnderstanding
{
    private const INTENTS = ['confirm', 'cancel', 'late', 'reschedule', 'choose', 'unknown'];

    /** Fixed; everything that varies goes in the user turn. (Too short to be worth caching.) */
    private const SYSTEM = <<<'TXT'
You read customers' replies to an appointment business in Saudi Arabia and the Gulf. Replies are in any Arabic dialect (Gulf, Hijazi, Levantine, Egyptian) or English, often informal, misspelled, or a voice-note transcript.

The business sent the customer a reminder or asked them to confirm (reply 1) or cancel (reply 2). Sometimes it also sent a numbered list of alternative times. Decide what the customer wants:

- confirm: they will attend ("1", "أكيد", "تمام", "إن شاء الله جاي").
- cancel: they will not attend and do not ask for another time ("2", "ما راح اقدر", "الغيه").
- late: they are coming but will be late.
- reschedule: they want a different time. Extract what they asked for, relative to today: `day` as YYYY-MM-DD; `window_from`/`window_to` as HH:MM for a part of the day (morning 09:00-12:00, noon 12:00-15:00, afternoon/العصر 15:00-18:00, evening/المغرب/بالليل 17:00-21:00); `time` as HH:MM for an exact time. "After Maghrib" is evening. A bare hour 1-7 without am/pm is afternoon.
- choose: an open offer of times is listed and they picked one; `option` is its 1-based number. Picking by description ("the Thursday one") also counts.
- unknown: a question or anything else that needs a person.

When a reply both declines and asks for another time, it is reschedule. Set every field you do not need to null.
TXT;

    public function __construct(
        private Client $client,
        private RuleUnderstanding $rules,
        private string $model,
    ) {
    }

    public function understand(string $text, CarbonInterface $now, array $context = []): array
    {
        try {
            $read = $this->ask($text, $now, $context);
            if ($read !== null) {
                return $read;
            }
        } catch (Throwable $e) {
            report($e);
        }

        return $this->rules->understand($text, $now, $context);
    }

    private function ask(string $text, CarbonInterface $now, array $context): ?array
    {
        $situation = ['Today: '.$now->locale('en')->isoFormat('dddd YYYY-MM-DD HH:mm')];
        if (isset($context['service'], $context['startAt'])) {
            $situation[] = "Their booking: {$context['service']} on {$context['startAt']}";
        }
        foreach ($context['offered'] ?? [] as $i => $at) {
            $situation[] = 'Open offer option '.($i + 1).": {$at}";
        }

        $nullable = fn (string $type) => ['type' => [$type, 'null']];
        $response = $this->client->beta->messages->create(
            model: $this->model,
            maxTokens: 1024,
            system: self::SYSTEM,
            messages: [[
                'role' => 'user',
                'content' => implode("\n", $situation)."\n\nCustomer's reply:\n".$text,
            ]],
            outputConfig: [
                // A short classification: thoroughness buys nothing here.
                'effort' => 'low',
                'format' => [
                    'type' => 'json_schema',
                    'schema' => [
                        'type' => 'object',
                        'properties' => [
                            'intent' => ['type' => 'string', 'enum' => self::INTENTS],
                            'option' => $nullable('integer'),
                            'day' => $nullable('string'),
                            'window_from' => $nullable('string'),
                            'window_to' => $nullable('string'),
                            'time' => $nullable('string'),
                        ],
                        'required' => ['intent', 'option', 'day', 'window_from', 'window_to', 'time'],
                        'additionalProperties' => false,
                    ],
                ],
            ],
            // If the model declines on policy grounds, the server retries on its
            // default fallback rather than leaving the reply unread.
            fallbacks: 'default',
            betas: ['server-side-fallback-2026-07-01'],
        );

        if ($response->stopReason === 'refusal') {
            return null;
        }
        foreach ($response->content as $block) {
            if ($block->type === 'text') {
                return $this->validate(json_decode($block->text, true), count($context['offered'] ?? []));
            }
        }

        return null;
    }

    /** The model's answer, checked and put in the shape the guard uses — or null. */
    private function validate(mixed $a, int $offered): ?array
    {
        if (! is_array($a) || ! in_array($a['intent'] ?? null, self::INTENTS, true)) {
            return null;
        }
        $out = ['intent' => $a['intent']];

        if ($a['intent'] === 'choose') {
            $option = $a['option'] ?? null;
            if (! is_int($option) || $option < 1 || $option > $offered) {
                return null;
            }
            $out['option'] = $option;
        }

        if ($a['intent'] === 'reschedule') {
            if (is_string($a['day'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $a['day'])) {
                $out['day'] = $a['day'];
            }
            $from = self::minutes($a['window_from'] ?? null);
            $to = self::minutes($a['window_to'] ?? null);
            if ($from !== null && $to !== null && $from < $to) {
                $out['window'] = [$from, $to];
            }
            if (($time = self::minutes($a['time'] ?? null)) !== null) {
                $out['time'] = $time;
            }
        }

        return $out;
    }

    private static function minutes(mixed $hm): ?int
    {
        if (! is_string($hm) || ! preg_match('/^([01]?\d|2[0-3]):([0-5]\d)$/', $hm, $m)) {
            return null;
        }

        return (int) $m[1] * 60 + (int) $m[2];
    }
}
