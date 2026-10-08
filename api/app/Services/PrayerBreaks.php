<?php

namespace App\Services;

use Carbon\CarbonInterface;
use DateTime;
use DateTimeZone;
use IntlDateFormatter;
use IslamicNetwork\PrayerTimes\PrayerTimes;
use Illuminate\Support\Carbon;

/**
 * Prayer pauses — prayerBreaks() in src/lib/prayer.js.
 *
 * The client computes the same pauses with a different library; the two can
 * differ by a minute or three. Both round out to five minutes, and the rule
 * that refuses a booking (Hours::isWithinHours) only refuses one clearly
 * inside a pause, so the server never turns down a time the page offered.
 */
class PrayerBreaks
{
    private const LABEL = [
        'fajr' => 'صلاة الفجر', 'dhuhr' => 'صلاة الظهر', 'asr' => 'صلاة العصر',
        'maghrib' => 'صلاة المغرب', 'isha' => 'صلاة العشاء', 'jumuah' => 'صلاة الجمعة',
    ];

    /**
     * The five times on a local date, for a city in config/cities.php.
     * Umm al-Qura: isha 90 minutes after maghrib, 120 in Ramadan.
     *
     * @return array<string, Carbon>|null
     */
    public function timesOn(CarbonInterface $day, string $cityKey, string $tz): ?array
    {
        $city = config("cities.$cityKey");
        if (! $city) {
            return null;
        }
        $date = new DateTime($day->format('Y-m-d').' 12:00', new DateTimeZone($tz));
        $raw = (new PrayerTimes($city['method']))->getTimes($date, $city['lat'], $city['lng']);
        $at = fn (string $hm) => Carbon::parse($day->format('Y-m-d').' '.$hm, $tz);

        $times = [
            'fajr' => $at($raw['Fajr']),
            'dhuhr' => $at($raw['Dhuhr']),
            'asr' => $at($raw['Asr']),
            'maghrib' => $at($raw['Maghrib']),
            'isha' => $at($raw['Isha']),
        ];
        if ($city['method'] === 'MAKKAH') {
            $times['isha'] = $times['maghrib']->copy()->addMinutes($this->isRamadan($date) ? 120 : 90);
        }

        return $times;
    }

    /**
     * Pauses inside a business day's window.
     *
     * @param  array{day: Carbon, open: Carbon, close: Carbon}  $window
     * @param  array{enabled?: bool, city?: string, prayers?: list<string>, minutes?: int, jumuahMinutes?: int}|null  $cfg
     * @return list<array{start: Carbon, end: Carbon, label: string, prayer: string}>
     */
    public function within(array $window, ?array $cfg, string $tz): array
    {
        if (! ($cfg['enabled'] ?? false)) {
            return [];
        }
        $out = [];
        foreach ([$window['day']->copy(), $window['day']->copy()->addDay()] as $day) {
            if ($day->gte($window['close'])) {
                break;
            }
            $times = $this->timesOn($day, $cfg['city'] ?? '', $tz);
            if (! $times) {
                return [];
            }
            foreach ($cfg['prayers'] ?? [] as $key) {
                if (! isset($times[$key])) {
                    continue;
                }
                $jumuah = $key === 'dhuhr' && (int) $day->format('w') === 5;
                $minutes = $jumuah ? ($cfg['jumuahMinutes'] ?? $cfg['minutes'] ?? 20) : ($cfg['minutes'] ?? 20);
                $start = self::down($times[$key]);
                $end = self::up($times[$key]->copy()->addMinutes($minutes));
                if ($start->lt($window['close']) && $end->gt($window['open'])) {
                    $out[] = ['start' => $start, 'end' => $end, 'label' => self::LABEL[$jumuah ? 'jumuah' : $key], 'prayer' => $key];
                }
            }
        }
        usort($out, fn ($a, $b) => $a['start'] <=> $b['start']);

        return $out;
    }

    private function isRamadan(DateTime $date): bool
    {
        $f = new IntlDateFormatter('en_US@calendar=islamic-umalqura', IntlDateFormatter::NONE, IntlDateFormatter::NONE,
            $date->getTimezone()->getName(), IntlDateFormatter::TRADITIONAL, 'M');

        return $f->format($date) === '9';
    }

    private static function down(Carbon $t): Carbon
    {
        return Carbon::createFromTimestamp(intdiv($t->getTimestamp(), 300) * 300, $t->getTimezone());
    }

    private static function up(Carbon $t): Carbon
    {
        return Carbon::createFromTimestamp((int) ceil($t->getTimestamp() / 300) * 300, $t->getTimezone());
    }
}
