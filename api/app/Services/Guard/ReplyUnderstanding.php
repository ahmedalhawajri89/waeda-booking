<?php

namespace App\Services\Guard;

use Carbon\CarbonInterface;

/**
 * Reads what a customer meant by a reply.
 *
 * Two implementations: RuleUnderstanding (word lists, always available) and
 * ClaudeUnderstanding (a language model, used when an API key is configured,
 * falling back to the rules on any failure). The guard depends only on this,
 * so swapping one for the other changes nothing else.
 *
 * The result is the shape understandReply() returns in src/lib/replyRules.js:
 *   intent  'confirm'|'cancel'|'late'|'reschedule'|'choose'|'unknown'
 *   option  int, 1-based  — 'choose'
 *   day     'Y-m-d'       — 'reschedule', when a day was named
 *   window  [from, to]    — minutes from midnight, a part of the day
 *   time    int           — minutes from midnight, an exact time
 */
interface ReplyUnderstanding
{
    /**
     * @param  CarbonInterface  $now  in the organization's zone
     * @param  array{offered?: list<string>, service?: string, startAt?: string}  $context
     *         `offered`: the times an open offer listed, as local "Y-m-d H:i" — while
     *         one is open a bare number picks from it.
     * @return array{intent: string, option?: int, day?: string, window?: array{int, int}, time?: int}
     */
    public function understand(string $text, CarbonInterface $now, array $context = []): array;
}
