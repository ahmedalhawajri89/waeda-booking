<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One time, many people: a yoga class, a course, a Quran circle.
 *
 * A service with a capacity above one is a class. It runs at set times each
 * week (its sessions: a day, a time, and who or where), and each seat taken
 * is an ordinary booking — so reminders, attendance and the waitlist keep
 * working one person at a time, while the slot fills up to its capacity.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('services', function (Blueprint $table) {
            $table->unsignedSmallInteger('capacity')->default(1)->after('buffer_min');
        });

        Schema::create('service_sessions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('org_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignUuid('service_id')->constrained('services')->cascadeOnDelete();
            $table->foreignUuid('resource_id')->constrained('resources')->cascadeOnDelete();
            $table->unsignedTinyInteger('weekday');
            $table->time('start_time');
            $table->timestamps();
            $table->index(['service_id', 'weekday']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_sessions');
        Schema::table('services', fn (Blueprint $t) => $t->dropColumn('capacity'));
    }
};
