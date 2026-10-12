import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { useThemeColors } from '@/hooks/useThemeColors';

function VoteButton({ label, icon, selected, disabled, onPress }) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: !!disabled }}
      className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 active:opacity-70 ${
        selected ? 'border-ink bg-ink' : 'border-border bg-surface'
      }`}
      style={{ opacity: disabled && !selected ? 0.6 : 1 }}>
      <Icon name={icon} size={13} color={selected ? c.inverse : c.muted} />
      <Text className={`font-sans-semibold text-xs ${selected ? 'text-inverse' : 'text-body'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * "Helpful (n)" / "Not helpful" for one review. `vote` is that review's row
 * from `fetchReviewVotes`; the active side (`myVote`) is filled, and tapping it
 * again clears the vote. `disabled` while a request for this review is in
 * flight, so rapid taps can't stack optimistic updates.
 * @param {{ vote: {helpfulCount:number, unhelpfulCount:number, myVote:number},
 *           onVote: (choice: 1 | -1) => void, disabled?: boolean }} props
 */
export function ReviewVoteButtons({ vote, onVote, disabled }) {
  return (
    <View className="flex-row items-center gap-2 pt-1">
      <VoteButton
        label={`Helpful (${vote.helpfulCount})`}
        icon="thumbs-up"
        selected={vote.myVote === 1}
        disabled={disabled}
        onPress={() => onVote(1)}
      />
      <VoteButton
        label="Not helpful"
        icon="thumbs-down"
        selected={vote.myVote === -1}
        disabled={disabled}
        onPress={() => onVote(-1)}
      />
    </View>
  );
}