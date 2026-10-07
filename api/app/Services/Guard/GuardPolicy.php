<?php

namespace App\Services\Guard;

use Illuminate\Support\Facades\DB;

/**
 * An organization's guard policy, read with defaults — the server half of
 * withDefaults() in src/lib/guard.js.
 */
final class GuardPolicy
{
    public const DEFAULTS = [
        'mediumAt' => 0.15,
        'highAt' => 0.3,
        'remindHoursBefore' => 24,
        'confirmHoursBefore' => 3,
        'depositForHigh' => true,
        'autoRelease' => false,
        'releaseHoursBefore' => 2,
    ];

    private function __construct(public readonly array $values)
    {
    }

    public static function for(string $org): self
    {
        $stored = DB::table('guard_policies')->where('org_id', $org)->value('policy');

        return new self(array_merge(self::DEFAULTS, $stored ? json_decode($stored, true) : []));
    }

    public function __get(string $key): mixed
    {
        return $this->values[$key];
    }

    /** 'low' | 'medium' | 'high' */
    public function tier(float $probability): string
    {
        return $probability >= $this->highAt ? 'high' : ($probability >= $this->mediumAt ? 'medium' : 'low');
    }
}
