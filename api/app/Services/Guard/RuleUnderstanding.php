<?php

namespace App\Services\Guard;

use Carbon\CarbonInterface;

/**
 * Reading a reply with word lists — understandReply() in
 * src/lib/replyRules.js, list for list, so the demo and the server read a
 * message the same way. Always available; the language model falls back to it.
 */
class RuleUnderstanding implements ReplyUnderstanding
{
    private const END = '(?=$|[\s.!،؟?,])';
    private const CONFIRM = '1|نعم|اي|ايوه|إيوه|ايوا|أكيد|اكيد|تمام|مؤكد|أؤكد|اؤكد|جاي|جاية|راح اجي|بجي|ok|okay|yes';
    private const CANCEL = '2|لا|ألغ\S*|الغ\S*|إلغاء|الغاء|ما راح|مارح|ما بقدر|ما اقدر|ما أقدر|مش جاي|مب جاي|cancel|no';
    private const LATE = 'بتأخر|بتاخر|متأخر|متاخر|راح اتأخر|تأخير|late';
    private const CHANGE = 'أغير|اغير|أغيّر|غير الموعد|غيّر|تغيير|أأجل|اأجل|أجل|أجّل|تأجيل|خليها|خلّيها|خليه|خلّيه|انقل|نقل|أبدل|ابدل|بدّل|بدل|موعد ثاني|وقت ثاني|موعد تاني|وقت تاني|وقت آخر|موعد آخر|موعد اخر|وقت اخر';

    /** Longest phrase first, so "بعد بكرة" is not read as "بكرة". */
    private const RELATIVE = [
        ['بعد\s*(بكرة|بكره|بكرا|غد)', 2],
        ['(بكرة|بكره|بكرا|غدا|غداً|الغد|بكرى)', 1],
        ['(اليوم|هاليوم)', 0],
    ];
    private const WEEKDAYS = [
        ['(الأحد|الاحد|احد)', 0],
        ['(الإثنين|الاثنين|اثنين|الإتنين|الاتنين)', 1],
        ['(الثلاثاء|الثلاثا|ثلاثاء|التلات|الثلاث)', 2],
        ['(الأربعاء|الاربعاء|اربعاء|الأربعا|الاربع)', 3],
        ['(الخميس|خميس)', 4],
        ['(الجمعة|الجمعه|جمعة)', 5],
        ['(السبت|سبت)', 6],
    ];
    private const PARTS = [
        ['(الصبح|الصباح|صباحا|صباحاً|بدري)', [540, 720]],
        ['(الظهر|الضهر|ظهرا|ظهراً)', [720, 900]],
        ['(العصر|عصرا|عصراً)', [900, 1080]],
        ['(المغرب|المسا|المساء|مساء|مساءً|بالليل|الليل)', [1020, 1260]],
    ];
    private const AM = '^(ص|صباح|صباحا|الصبح)$';
    private const PM = '^(م|مساء|مساءً|العصر|المسا|المغرب|الظهر|بالليل)$';
    private const HOUR = '(الساعة|الساعه|ساعة)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(ص|صباحا|صباح|الصبح|م|مساءً|مساء|العصر|المسا|المغرب|الظهر|بالليل)?';

    public function understand(string $text, CarbonInterface $now, array $context = []): array
    {
        $t = preg_replace('/[.!،؟?]+$/u', '', self::asciiDigits(trim($text)));
        $offered = count($context['offered'] ?? []);

        if ($offered && preg_match('/^(\d)$/', $t, $n) && (int) $n[1] >= 1 && (int) $n[1] <= $offered) {
            return ['intent' => 'choose', 'option' => (int) $n[1]];
        }

        // The menu every message offers: 1 confirm, 2 cancel, 3 another time.
        if ($t === '3') {
            return ['intent' => 'reschedule'];
        }

        $when = $this->readWhen($t, $now);
        if (preg_match('/('.self::CHANGE.')/u', $t)) {
            return ['intent' => 'reschedule'] + $when;
        }
        if (preg_match('/^('.self::CANCEL.')'.self::END.'/iu', $t)) {
            return ['intent' => 'cancel'];
        }
        if (preg_match('/^('.self::CONFIRM.')'.self::END.'/iu', $t) || preg_match('/^(👍|✅)/u', $t)) {
            return ['intent' => 'confirm'];
        }
        if (preg_match('/('.self::LATE.')/iu', $t)) {
            return ['intent' => 'late'];
        }
        if ($when) {
            return ['intent' => 'reschedule'] + $when;
        }

        return ['intent' => 'unknown'];
    }

    /** Kept for callers that only need the intent. */
    public function interpret(string $text, ?CarbonInterface $now = null): string
    {
        return $this->understand($text, $now ?? now())['intent'];
    }

    private function readWhen(string $t, CarbonInterface $now): array
    {
        $out = [];

        $offset = null;
        foreach (self::RELATIVE as [$re, $days]) {
            if (preg_match('/'.$re.'/u', $t)) {
                $offset = $days;
                break;
            }
        }
        if ($offset === null) {
            foreach (self::WEEKDAYS as [$re, $weekday]) {
                if (preg_match('/'.$re.'/u', $t)) {
                    // The next one to come — today's own weekday means next week.
                    $offset = (($weekday - (int) $now->format('w') + 7) % 7) ?: 7;
                    break;
                }
            }
        }
        if ($offset !== null) {
            $out['day'] = $now->copy()->startOfDay()->addDays($offset)->format('Y-m-d');
        }

        foreach (self::PARTS as [$re, $window]) {
            if (preg_match('/'.$re.'/u', $t)) {
                $out['window'] = $window;
                break;
            }
        }

        // A number is a time only with something saying so — never a bare "2".
        if (preg_match('/'.self::HOUR.self::END.'/u', $t, $m, PREG_UNMATCHED_AS_NULL)
            && ($m[1] || $m[4] || isset($out['day']) || isset($out['window']))) {
            $hour = (int) $m[2];
            $minute = (int) ($m[3] ?? 0);
            $suffix = $m[4] ?? '';
            if ($hour <= 23 && $minute < 60) {
                if (preg_match('/'.self::AM.'/u', $suffix)) {
                    if ($hour === 12) {
                        $hour = 0;
                    }
                } elseif (preg_match('/'.self::PM.'/u', $suffix) || (isset($out['window']) && $out['window'][0] >= 720)) {
                    if ($hour < 12) {
                        $hour += 12;
                    }
                } elseif ($hour >= 1 && $hour <= 7) {
                    $hour += 12;
                }
                $out['time'] = $hour * 60 + $minute;
            }
        }

        return $out;
    }

    /** Arabic-Indic and Persian digits to ASCII. */
    private static function asciiDigits(string $text): string
    {
        return strtr($text, [
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4',
            '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
        ]);
    }
}
