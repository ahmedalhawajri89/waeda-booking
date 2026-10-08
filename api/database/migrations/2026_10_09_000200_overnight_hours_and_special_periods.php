<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Hours as businesses in the region keep them.
 *
 * A padel club open 16:00 to 02:00, a café through suhoor: a close before the
 * open now means the next morning, so the check that refused it goes. And
 * Ramadan, Eid and holidays get their own hours for their own dates instead
 * of the owner rewriting the week twice a year.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('alter table business_hours drop constraint business_hours_ordered');
        }

        Schema::create('special_periods', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('org_id')->constrained('organizations')->cascadeOnDelete();
            $table->string('label', 80);
            $table->date('starts_on');
            $table->date('ends_on');
            // Seven rows shaped like business_hours: weekday, open, close, isClosed.
            $table->json('hours');
            $table->timestamps();
            $table->index(['org_id', 'starts_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('special_periods');
        if (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('alter table business_hours add constraint business_hours_ordered check (is_closed = 1 or close_time > open_time)');
        }
    }
};
